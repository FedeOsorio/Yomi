import { PermissionsAndroid, Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

/**
 * Dictado por voz con el reconocedor del teléfono (Google en Android, Siri en iOS). Lo usa el formulario de
 * tarjetas personalizadas para escribir la pregunta y la respuesta hablando. La app no evalúa pronunciación.
 */

const NATIVE_LANG_MAP: Record<string, string> = {
  ja: 'ja-JP',
  zh: 'zh-CN',
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
};

export interface SpeechRecognitionCallbacks {
  onResult: (transcript: string, isFinal: boolean) => void;
  onError?: (errorMessage: string) => void;
  onEnd?: () => void;
}

class SpeechRecognitionService {
  private subs: Array<{ remove: () => void }> = [];
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();

  /** Serializa start/stop para que nunca corran en paralelo. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  private async ensurePermission(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const perm = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
      if (await PermissionsAndroid.check(perm)) return true;
      return (await PermissionsAndroid.request(perm)) === PermissionsAndroid.RESULTS.GRANTED;
    }
    if ((await ExpoSpeechRecognitionModule.getPermissionsAsync()).granted) return true;
    return (await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted;
  }

  start(languageCode: string, callbacks: SpeechRecognitionCallbacks): Promise<boolean> {
    return this.enqueue(async () => {
      this.stopNow();
      const gen = this.generation;
      const live = () => gen === this.generation;

      if (!(await this.ensurePermission())) {
        callbacks.onError?.('Permiso de micrófono denegado');
        return false;
      }

      const base = languageCode.toLowerCase().split('-')[0];
      const lang = languageCode.includes('-') ? languageCode : NATIVE_LANG_MAP[base] ?? languageCode;
      // "end" se avisa una sola vez: después de un error, el reconocedor termina de cerrarse y recién ahí lo manda
      let ended = false;
      this.subs = [
        ExpoSpeechRecognitionModule.addListener('result', (e) => {
          if (!live() || !e.results || e.results.length === 0) return;
          const text = e.results[0]?.transcript ?? '';
          if (text) callbacks.onResult(text, e.isFinal ?? false);
        }),
        ExpoSpeechRecognitionModule.addListener('error', (e) => {
          if (!live() || e.error === 'aborted') return;
          // Silencio: no es un error para el usuario; el "end" que sigue avisa que se cerró
          if (e.error === 'no-speech' || e.error === 'speech-timeout') return;
          callbacks.onError?.(e.message || e.error || 'Error de reconocimiento');
        }),
        ExpoSpeechRecognitionModule.addListener('end', () => {
          if (!live() || ended) return;
          ended = true;
          callbacks.onEnd?.();
        }),
      ];

      try {
        ExpoSpeechRecognitionModule.start({ lang, interimResults: true, continuous: false });
        return true;
      } catch (e: any) {
        this.removeSubs();
        callbacks.onError?.(e?.message || 'No se pudo iniciar el reconocimiento');
        return false;
      }
    });
  }

  private removeSubs() {
    this.subs.forEach((s) => s.remove());
    this.subs = [];
  }

  private stopNow() {
    this.generation++;
    if (this.subs.length === 0) return;
    this.removeSubs();
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {}
  }

  /** Detiene el micrófono y descarta cualquier resultado pendiente. */
  stop(): Promise<void> {
    return this.enqueue(async () => this.stopNow());
  }
}

export const speechService = new SpeechRecognitionService();
