import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionOptions,
} from 'expo-speech-recognition';
import { sherpaVoiceService } from './sherpa-service';

/**
 * Mapeo de códigos de idioma de Yomi a tags de idioma BCP-47 para reconocimiento de voz.
 */
const LANGUAGE_RECOGNITION_MAP: Record<string, string> = {
  'zh-CN': 'zh-CN',
  'zh': 'zh-CN',
  'ja-JP': 'ja-JP',
  'ja': 'ja-JP',
  'en-US': 'en-US',
  'en': 'en-US',
  'es-ES': 'es-ES',
  'es': 'es-ES',
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
  /** Prompt inicial para el modelo (la lectura o kanji esperado) */
  initialPrompt?: string;
  /** Gramática cerrada (obsoleta en modelos neuronales) */
  voskGrammar?: string[];
  /** Motor preferido: 'auto' | 'sherpa' | 'native' */
  preferredEngine?: 'auto' | 'sherpa' | 'native';
}

class SpeechRecognitionService {
  private activeSubscriptions: Array<{ remove: () => void }> = [];
  private isListeningActive = false;
  private isStarting = false;
  private hasCheckedPermissions = false;
  private activeEngine: 'sherpa' | 'native' | null = null;

  /**
   * Contador de generación: se incrementa en cada start() para invalidar
   * automáticamente callbacks de sesiones anteriores que lleguen tarde.
   */
  private generation = 0;

  /**
   * Cola de operaciones: serializa todas las llamadas a start() y abort()
   * para que nunca se ejecuten en paralelo.
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
   */
  invalidate(): void {
    this.generation++;
  }

  /**
   * Encola una operación para ejecución secuencial.
   */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(fn, fn);
    this.operationQueue = result.then(() => { }, () => { });
    return result;
  }

  /**
   * Inicia el reconocimiento de voz en el idioma especificado.
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
    this.isStarting = true;
    try {
      return await this._executeStart(languageCode, callbacks, options);
    } finally {
      this.isStarting = false;
    }
  }

  private async _executeStart(
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

    // Limpiar cualquier sesión previa
    await this._abortInternal();

    const gen = this.generation;

    // 1. Intentar reconocimiento con Sherpa-ONNX SenseVoice Offline
    const isJapanese = languageCode.toLowerCase().startsWith('ja');
    const isChinese = languageCode.toLowerCase().startsWith('zh');
    const isEnglish = languageCode.toLowerCase().startsWith('en');
    const isSupportedBySherpa = isJapanese || isChinese || isEnglish;
    const wantsNative = options?.preferredEngine === 'native';

    if (!wantsNative && isSupportedBySherpa && sherpaVoiceService.checkNativeModule()) {
      if (!sherpaVoiceService.isReady()) {
        console.log('[SpeechRecognition] Sherpa model not loaded yet, initializing SenseVoice...');
        await sherpaVoiceService.loadModel();
      }

      if (sherpaVoiceService.isReady()) {
        console.log(`[SpeechRecognition] Starting Sherpa SenseVoice recognition for lang: ${languageCode}`);
        const started = await sherpaVoiceService.start(
          {
            onResult: (hypothesis, isFinal, alternatives) => {
              if (this.generation !== gen) return;
              const cleaned = (hypothesis || '').trim();
              if (!cleaned) return;
              callbacks.onResult(cleaned, isFinal, alternatives || [cleaned]);
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
            onTimeout: () => {
              if (this.generation !== gen) return;
              this.isListeningActive = false;
              callbacks.onEnd?.();
            },
          },
          {
            language: languageCode,
            initialPrompt: options?.initialPrompt,
          }
        );

        if (started) {
          this.activeEngine = 'sherpa';
          this.isListeningActive = true;
          return true;
        }
        console.warn('[SpeechRecognition] Sherpa failed to start, falling back to native engine');
      } else {
        console.warn('[SpeechRecognition] Sherpa model not ready, falling back to native engine');
      }
    }

    this.activeEngine = 'native';

    const targetLang = LANGUAGE_RECOGNITION_MAP[languageCode] || 'ja-JP';

    try {
      console.log('[SpeechRecognition] Starting native recognition for lang:', targetLang);

      const resultSub = ExpoSpeechRecognitionModule.addListener('result', (event) => {
        if (this.generation !== gen) return;
        const allTranscripts = (event.results || [])
          .map((r) => r.transcript)
          .filter(Boolean);
        const firstResult = allTranscripts[0] || '';
        console.log('[SpeechRecognition] Result:', firstResult, 'isFinal:', event.isFinal, 'alternatives:', allTranscripts);
        if (firstResult || allTranscripts.length > 0) {
          callbacks.onResult(firstResult, event.isFinal ?? false, allTranscripts);
        }
      });

      const errorSub = ExpoSpeechRecognitionModule.addListener('error', (event) => {
        if (this.generation !== gen) return;
        if (event.error === 'aborted') return;
        if (event.error === 'no-speech' || event.error === 'speech-timeout') {
          console.log('[SpeechRecognition] Silence detected while user is thinking, continuing listening...');
          callbacks.onEnd?.();
          return;
        }
        console.warn('[SpeechRecognition] Error event:', event.error, event.message);
        this.isListeningActive = false;
        callbacks.onError?.(event.message || event.error || 'Error de reconocimiento');
      });

      const startSub = ExpoSpeechRecognitionModule.addListener('start', () => {
        if (this.generation !== gen) return;
        console.log('[SpeechRecognition] Native mic STARTED listening');
        this.isListeningActive = true;
        callbacks.onStart?.();
      });

      const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
        if (this.generation !== gen) return;
        console.log('[SpeechRecognition] Native mic ENDED');
        this.isListeningActive = false;
        callbacks.onEnd?.();
      });

      this.activeSubscriptions = [resultSub, errorSub, startSub, endSub];

      const recognitionOptions: ExpoSpeechRecognitionOptions = {
        lang: targetLang,
        interimResults: true,
        continuous: options?.continuous ?? true,
        maxAlternatives: 10,
        iosTaskHint: 'confirmation',
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: 'free_form',
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 5000,
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 15000,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 15000,
          EXTRA_PREFER_OFFLINE: false,
        },
      };

      if (options?.contextualStrings && options.contextualStrings.length > 0) {
        recognitionOptions.contextualStrings = options.contextualStrings.slice(0, 100);
      }

      await ExpoSpeechRecognitionModule.start(recognitionOptions);
      this.isListeningActive = true;
      return true;
    } catch (e: any) {
      console.warn('[SpeechRecognition] Could not start native recognition:', e);
      this.isListeningActive = false;
      this.cleanupSubscriptions();
      callbacks.onError?.(e?.message || 'Error al iniciar reconocimiento');
      return false;
    }
  }

  /**
   * Aborta el reconocimiento de voz inmediatamente.
   */
  async abort(): Promise<void> {
    return this.enqueue(() => this._abortInternal());
  }

  private async _abortInternal(): Promise<void> {
    this.isListeningActive = false;
    this.cleanupSubscriptions();

    if (this.activeEngine === 'sherpa') {
      try {
        await sherpaVoiceService.abort();
      } catch { }
    }

    if (this.activeEngine === 'native') {
      try {
        await new Promise<void>((resolve) => {
          let resolved = false;
          const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
            if (!resolved) {
              resolved = true;
              try { endSub.remove(); } catch { }
              resolve();
            }
          });
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              try { endSub.remove(); } catch { }
              resolve();
            }
          }, 250);

          try {
            ExpoSpeechRecognitionModule.abort();
          } catch {
            try {
              ExpoSpeechRecognitionModule.stop();
            } catch { }
          }
        });
      } catch { }
    }

    this.activeEngine = null;
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

  /**
   * Retorna el motor activo ('sherpa' | 'native' | null).
   */
  getActiveEngine(): 'sherpa' | 'native' | null {
    return this.activeEngine;
  }

  /**
   * Retorna si el servicio se encuentra en proceso de conexión/arranque.
   */
  isStartingState(): boolean {
    return this.isStarting;
  }
}

export const speechService = new SpeechRecognitionService();
