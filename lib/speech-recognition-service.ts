import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionOptions,
} from 'expo-speech-recognition';

/**
 * Mapeo de códigos de idioma de Yomi a tags de idioma BCP-47 para reconocimiento de voz.
 */
const LANGUAGE_RECOGNITION_MAP: Record<string, string> = {
  'zh-CN': 'zh-CN',
  'zh': 'zh-CN',
  'ja': 'ja-JP',
  'ja-JP': 'ja-JP',
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
}

class SpeechRecognitionService {
  private activeSubscriptions: Array<{ remove: () => void }> = [];
  private isListeningActive = false;
  private hasCheckedPermissions = false;

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
   * Inicia el reconocimiento de voz en el idioma especificado.
   */
  async start(
    languageCode: string,
    callbacks: SpeechRecognitionCallbacks,
    options?: SpeechRecognitionOptions
  ): Promise<boolean> {
    if (!this.hasCheckedPermissions) {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        callbacks.onError?.('Permiso de micrófono denegado');
        return false;
      }
      this.hasCheckedPermissions = true;
    }

    // Cancelar y limpiar cualquier sesión previa de inmediato
    await this.abort();
    // Breve pausa para permitir que el hardware de audio nativo de Android libere el canal
    await new Promise((r) => setTimeout(r, 60));

    const targetLang = LANGUAGE_RECOGNITION_MAP[languageCode] || 'ja-JP';

    try {
      // Suscribirse a eventos de la librería nativa
      const resultSub = ExpoSpeechRecognitionModule.addListener('result', (event) => {
        const allTranscripts = (event.results || [])
          .map((r) => r.transcript)
          .filter(Boolean);
        const firstResult = allTranscripts[0] || '';
        if (firstResult || allTranscripts.length > 0) {
          callbacks.onResult(firstResult, event.isFinal ?? false, allTranscripts);
        }
      });

      const errorSub = ExpoSpeechRecognitionModule.addListener('error', (event) => {
        this.isListeningActive = false;
        callbacks.onError?.(event.message || 'Error de reconocimiento');
      });

      const startSub = ExpoSpeechRecognitionModule.addListener('start', () => {
        this.isListeningActive = true;
        callbacks.onStart?.();
      });

      const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
        this.isListeningActive = false;
        callbacks.onEnd?.();
      });

      this.activeSubscriptions = [resultSub, errorSub, startSub, endSub];

      const recognitionOptions: ExpoSpeechRecognitionOptions = {
        lang: targetLang,
        interimResults: true,
        continuous: options?.continuous ?? true,
        maxAlternatives: options?.maxAlternatives ?? 10,
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: options?.androidLanguageModel ?? 'free_form',
        },
      };

      if (options?.contextualStrings && options.contextualStrings.length > 0) {
        // Filtrar duplicados y vacíos
        recognitionOptions.contextualStrings = Array.from(new Set(options.contextualStrings.filter(Boolean)));
      }

      // Iniciar el módulo nativo de reconocimiento con streaming en tiempo real y opciones
      try {
        ExpoSpeechRecognitionModule.start(recognitionOptions);
        this.isListeningActive = true;
        return true;
      } catch {
        // Si el motor nativo aún estaba en transición, reintentar tras breve pausa
        await new Promise((r) => setTimeout(r, 180));
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {}
        await new Promise((r) => setTimeout(r, 50));
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
   */
  async abort(): Promise<void> {
    this.isListeningActive = false;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {}
    }

    this.cleanupSubscriptions();
  }

  /**
   * Detiene el reconocimiento de voz y limpia los listeners.
   */
  async stop(): Promise<void> {
    this.isListeningActive = false;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {}
    }

    this.cleanupSubscriptions();
  }

  private cleanupSubscriptions(): void {
    this.activeSubscriptions.forEach((sub) => {
      try {
        sub.remove();
      } catch {}
    });
    this.activeSubscriptions = [];
  }

  /**
   * Retorna si el servicio se encuentra escuchando activamente.
   */
  isListening(): boolean {
    return this.isListeningActive;
  }
}

export const speechService = new SpeechRecognitionService();
