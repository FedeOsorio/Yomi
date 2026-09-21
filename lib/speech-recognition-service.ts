import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionOptions,
} from 'expo-speech-recognition';
import { whisperVoiceService } from './whisper-service';

/**
 * Mapeo de códigos de idioma de Yomi a tags de idioma BCP-47 para reconocimiento de voz.
 */
const LANGUAGE_RECOGNITION_MAP: Record<string, string> = {
  'zh-CN': 'zh-CN',
  'zh': 'zh-CN',
  'ja-JP': 'ja-JP',
  'ja': 'ja-JP',
  'en': 'en-US',
  'en-US': 'en-US',
  'es': 'es-ES',
  'es-ES': 'es-ES',
};

export interface SpeechRecognitionCallbacks {
  onResult: (transcript: string, isFinal: boolean, alternatives?: string[]) => void;
  onError?: (errorMessage: string) => void;
  onEnd?: () => void;
  onStart?: () => void;
}

export interface SpeechRecognitionOptions {
  /** Términos esperados para sesgar el reconocedor (ej. la palabra actual y sus lecturas) */
  contextualStrings?: string[];
  /** Cantidad máxima de alternativas fonéticas a devolver */
  maxAlternatives?: number;
  /** Modo continuo */
  continuous?: boolean;
  /** Modelo de lenguaje en Android: 'free_form' (vocabulario general/fonético) o 'web_search' */
  androidLanguageModel?: 'free_form' | 'web_search';
  /** Prompt inicial para Whisper (la lectura o kanji esperado) */
  initialPrompt?: string;
  /** Motor preferido: 'auto' (Whisper si está disponible, sino nativo) | 'whisper' | 'native' */
  preferredEngine?: 'auto' | 'whisper' | 'native';
}

class SpeechRecognitionService {
  private activeSubscriptions: Array<{ remove: () => void }> = [];
  private isListeningActive = false;
  private hasCheckedPermissions = false;
  private activeEngine: 'whisper' | 'native' | null = null;

  /**
   * Contador de generación: se incrementa en cada start() para invalidar
   * automáticamente callbacks de sesiones anteriores que lleguen tarde.
   * Los callbacks verifican su generación capturada contra la generación actual
   * antes de ejecutarse; si no coinciden, se descartan silenciosamente.
   */
  private generation = 0;

  /**
   * Cola de operaciones: serializa todas las llamadas a start() y abort()
   * para que nunca se ejecuten en paralelo. Elimina race conditions entre
   * stop/start entre tarjetas que corrompían el motor nativo.
   */
  private operationQueue: Promise<void> = Promise.resolve();

  /**
   * Solicita permisos de micrófono al usuario en tiempo de ejecución.
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const response = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (response.granted) return true;
      const micRes = await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
      return micRes.granted;
    } catch (e) {
      console.warn('Error solicitando permisos de reconocimiento de voz:', e);
      return false;
    }
  }

  /**
   * Verifica si los permisos de micrófono ya fueron otorgados.
   */
  async checkPermissions(): Promise<boolean> {
    try {
      const { granted } = await ExpoSpeechRecognitionModule.getPermissionsAsync();
      return granted;
    } catch (e) {
      console.warn('Error verificando permisos de reconocimiento de voz:', e);
      return false;
    }
  }

  /**
   * Retorna la generación actual del servicio. Útil para que la capa superior
   * verifique si una operación sigue siendo vigente.
   */
  getGeneration(): number {
    return this.generation;
  }

  /**
   * Invalida todos los callbacks de sesiones anteriores incrementando la generación.
   * Llamar esto antes de iniciar una nueva sesión para una nueva tarjeta.
   */
  invalidate(): void {
    this.generation++;
  }

  /**
   * Encola una operación para ejecución secuencial. Garantiza que start() y abort()
   * nunca se ejecuten en paralelo, eliminando corrupción del motor nativo.
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(fn, fn);
    // Actualizar la cola para que la próxima operación espere a esta
    this.operationQueue = result.then(() => { }, () => { });
    return result;
  }

  /**
   * Inicia el reconocimiento de voz en el idioma especificado.
   * Serializado por la promise queue: espera a que cualquier abort() previo termine.
   */
  async start(
    languageCode: string,
    callbacks: SpeechRecognitionCallbacks,
    options?: SpeechRecognitionOptions
  ): Promise<boolean> {
    return this.enqueue(() => this._startInternal(languageCode, callbacks, options));
  }

  private async _startInternal(
    languageCode: string,
    callbacks: SpeechRecognitionCallbacks,
    options?: SpeechRecognitionOptions
  ): Promise<boolean> {
    if (!this.hasCheckedPermissions) {
      const alreadyGranted = await this.checkPermissions();
      if (alreadyGranted) {
        this.hasCheckedPermissions = true;
      } else {
        const hasPermission = await this.requestPermissions();
        if (!hasPermission) {
          callbacks.onError?.('Permiso de micrófono denegado');
          return false;
        }
        this.hasCheckedPermissions = true;
      }
    }

    // Limpiar cualquier sesión previa (ya estamos en la queue, no hay race condition)
    await this._abortInternal();

    // Capturar la generación actual para guardar con los callbacks
    const gen = this.generation;

    // Intentar reconocimiento con Whisper On-Device si está disponible y listo
    const useWhisper = options?.preferredEngine !== 'native' && whisperVoiceService.checkNativeModule();
    if (useWhisper) {
      const isWhisperReady = await whisperVoiceService.isModelReady();
      if (isWhisperReady) {
        const started = await whisperVoiceService.start(
          {
            lang: languageCode,
            initialPrompt: options?.initialPrompt ?? options?.contextualStrings?.[0],
          },
          {
            onResult: (transcript, isFinal) => {
              if (this.generation !== gen) return;
              callbacks.onResult(transcript, isFinal, [transcript]);
            },
            onError: (errorMessage) => {
              if (this.generation !== gen) return;
              this.isListeningActive = false;
              callbacks.onError?.(errorMessage);
            },
            onStart: () => {
              if (this.generation !== gen) return;
              this.isListeningActive = true;
              callbacks.onStart?.();
            },
            onEnd: () => {
              if (this.generation !== gen) return;
              this.isListeningActive = false;
              callbacks.onEnd?.();
            },
          }
        );
        if (started) {
          this.activeEngine = 'whisper';
          this.isListeningActive = true;
          return true;
        }
      } else {
        // Si el modelo aún no está descargado, iniciar descarga en segundo plano para futuros repasos
        whisperVoiceService.ensureModel().catch(() => {});
      }
    }

    this.activeEngine = 'native';

    const targetLang = LANGUAGE_RECOGNITION_MAP[languageCode] || 'ja-JP';

    try {
      // Suscribirse a eventos con guard de generación: si la generación cambió
      // desde que se crearon estos listeners, los callbacks se ignoran silenciosamente
      const resultSub = ExpoSpeechRecognitionModule.addListener('result', (event) => {
        if (this.generation !== gen) return;
        const allTranscripts = (event.results || [])
          .map((r) => r.transcript)
          .filter(Boolean);
        const firstResult = allTranscripts[0] || '';
        if (firstResult || allTranscripts.length > 0) {
          callbacks.onResult(firstResult, event.isFinal ?? false, allTranscripts);
        }
      });

      const errorSub = ExpoSpeechRecognitionModule.addListener('error', (event) => {
        if (this.generation !== gen) return;
        // Ignorar eventos 'aborted' provocados deliberadamente al cambiar de tarjeta
        if (event.error === 'aborted') return;
        this.isListeningActive = false;
        callbacks.onError?.(event.message || event.error || 'Error de reconocimiento');
      });

      const startSub = ExpoSpeechRecognitionModule.addListener('start', () => {
        if (this.generation !== gen) return;
        this.isListeningActive = true;
        callbacks.onStart?.();
      });

      const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
        if (this.generation !== gen) return;
        this.isListeningActive = false;
        callbacks.onEnd?.();
      });

      this.activeSubscriptions = [resultSub, errorSub, startSub, endSub];

      // Configuración optimizada:
      // - web_search: Google lo recomienda para reconocimiento de palabras sueltas
      // - iosTaskHint: 'confirmation' optimiza para utterances cortas (sí/no/una palabra)
      const recognitionOptions: ExpoSpeechRecognitionOptions = {
        lang: targetLang,
        interimResults: true,
        continuous: options?.continuous ?? true,
        maxAlternatives: options?.maxAlternatives ?? 10,
        iosTaskHint: 'confirmation',
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: options?.androidLanguageModel ?? 'web_search',
        },
      };

      if (options?.contextualStrings && options.contextualStrings.length > 0) {
        // Filtrar duplicados y vacíos
        recognitionOptions.contextualStrings = Array.from(new Set(options.contextualStrings.filter(Boolean)));
      }

      // Iniciar el módulo nativo de reconocimiento
      try {
        ExpoSpeechRecognitionModule.start(recognitionOptions);
        this.isListeningActive = true;
        return true;
      } catch {
        // Si el motor nativo aún estaba en transición, reintentar tras confirmar estado inactivo
        await this._waitForInactive();
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch { }
        await this._waitForInactive();
        ExpoSpeechRecognitionModule.start(recognitionOptions);
        this.isListeningActive = true;
        return true;
      }
    } catch (err: unknown) {
      this.isListeningActive = false;
      const message = err instanceof Error ? err.message : 'No se pudo iniciar el micrófono';
      console.warn('Error iniciando SpeechRecognition:', message);
      callbacks.onError?.(message);
      return false;
    }
  }

  /**
   * Cancela inmediatamente la sesión nativa de reconocimiento de voz y libera el micrófono.
   * Serializado por la promise queue.
   */
  async abort(): Promise<void> {
    return this.enqueue(() => this._abortInternal());
  }

  private async _abortInternal(): Promise<void> {
    this.isListeningActive = false;
    this.cleanupSubscriptions();

    if (this.activeEngine === 'whisper') {
      try {
        await whisperVoiceService.stop();
      } catch { }
      this.activeEngine = null;
    }

    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch { }
    }

    // Esperar determinísticamente a que el motor nativo confirme estado inactivo
    await this._waitForInactive();
  }

  /**
   * Espera activamente a que el motor nativo reporte estado 'inactive'.
   * Polling con intervalos cortos, máximo 500ms total.
   */
  private async _waitForInactive(): Promise<void> {
    try {
      for (let i = 0; i < 10; i++) {
        const state = await ExpoSpeechRecognitionModule.getStateAsync();
        if (state === 'inactive') return;
        await new Promise((r) => setTimeout(r, 50));
      }
    } catch { }
  }

  /**
   * Detiene el reconocimiento de voz y limpia los listeners.
   */
  async stop(): Promise<void> {
    return this.abort();
  }

  private cleanupSubscriptions(): void {
    const subs = this.activeSubscriptions;
    this.activeSubscriptions = [];
    subs.forEach((sub) => {
      try {
        sub.remove();
      } catch { }
    });
  }

  /**
   * Retorna si el servicio se encuentra escuchando activamente.
   */
  isListening(): boolean {
    return this.isListeningActive;
  }
}

export const speechService = new SpeechRecognitionService();
