import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

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
  onResult: (transcript: string, isFinal: boolean) => void;
  onError?: (errorMessage: string) => void;
  onEnd?: () => void;
  onStart?: () => void;
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
    callbacks: SpeechRecognitionCallbacks
  ): Promise<boolean> {
    if (!this.hasCheckedPermissions) {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        callbacks.onError?.('Permiso de micrófono denegado');
        return false;
      }
      this.hasCheckedPermissions = true;
    }

    // Detener cualquier escucha previa y limpiar suscripciones viejas
    await this.stop();

    const targetLang = LANGUAGE_RECOGNITION_MAP[languageCode] || 'ja-JP';

    try {
      // Suscribirse a eventos de la librería nativa
      const resultSub = ExpoSpeechRecognitionModule.addListener('result', (event) => {
        const firstResult = event.results?.[0];
        if (firstResult) {
          callbacks.onResult(firstResult.transcript, event.isFinal ?? false);
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

      // Iniciar el módulo nativo de reconocimiento con streaming en tiempo real y escucha continua
      ExpoSpeechRecognitionModule.start({
        lang: targetLang,
        interimResults: true,
        continuous: true,
        androidIntentOptions: {
          EXTRA_PARTIAL_RESULTS: true,
        },
      });

      this.isListeningActive = true;
      return true;
    } catch (err: unknown) {
      this.isListeningActive = false;
      const message = err instanceof Error ? err.message : 'No se pudo iniciar el micrófono';
      console.warn('Error iniciando SpeechRecognition:', message);
      callbacks.onError?.(message);
      return false;
    }
  }

  /**
   * Detiene el reconocimiento de voz y limpia los listeners.
   */
  async stop(): Promise<void> {
    this.isListeningActive = false;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Ignorar si ya estaba detenido
    }

    this.activeSubscriptions.forEach((sub) => {
      try {
        sub.remove();
      } catch {
        // Ignorar si ya fue removido
      }
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
