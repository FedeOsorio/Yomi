import { PermissionsAndroid, Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { sherpaVoiceService, toSenseVoiceLang } from './sherpa-service';

/**
 * Punto de entrada único para el reconocimiento de voz de la app.
 * - Japonés / chino / inglés → Sherpa-ONNX offline (un resultado final por intento).
 * - Cualquier otro idioma (p. ej. español en tarjetas personalizadas) → reconocedor nativo del sistema.
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
  onStart?: () => void;
}

export interface SpeechRecognitionOptions {
  /** Palabras esperadas para sesgar el reconocedor nativo (Sherpa las ignora). */
  contextualStrings?: string[];
  /** Forzar el reconocedor nativo aunque el idioma lo soporte Sherpa. */
  preferredEngine?: 'auto' | 'native';
  continuous?: boolean;
}

/** Indica si el idioma se reconoce con el modelo offline (y por lo tanto necesita descargarlo). */
export function usesOfflineModel(languageCode: string): boolean {
  return ['ja', 'zh', 'en'].includes(toSenseVoiceLang(languageCode) ?? '');
}

class SpeechRecognitionService {
  private engine: 'sherpa' | 'native' | null = null;
  private nativeSubs: Array<{ remove: () => void }> = [];
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();

  /** Serializa start/abort para que nunca corran en paralelo. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  async checkPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    }
    return (await ExpoSpeechRecognitionModule.getPermissionsAsync()).granted;
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      return res === PermissionsAndroid.RESULTS.GRANTED;
    }
    return (await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted;
  }

  /** Generación actual: cambia con cada start()/invalidate(); sirve para descartar callbacks viejos. */
  getGeneration(): number {
    return this.generation;
  }

  invalidate(): void {
    this.generation++;
  }

  isListening(): boolean {
    return this.engine === 'sherpa' ? sherpaVoiceService.isListening() : this.engine === 'native';
  }

  start(
    languageCode: string,
    callbacks: SpeechRecognitionCallbacks,
    options: SpeechRecognitionOptions = {}
  ): Promise<boolean> {
    return this.enqueue(async () => {
      // No se cambia la generación aquí: la pantalla la fija con invalidate() antes de llamar a start().
      await this.abortNow(false);
      const gen = this.generation;
      const live = () => gen === this.generation;

      if (!(await this.checkPermissions()) && !(await this.requestPermissions())) {
        callbacks.onError?.('Permiso de micrófono denegado');
        return false;
      }

      if (options.preferredEngine !== 'native' && usesOfflineModel(languageCode)) {
        this.engine = 'sherpa';
        const ok = await sherpaVoiceService.start(languageCode, {
          onResult: (text) => live() && callbacks.onResult(text, true),
          onError: (msg) => live() && callbacks.onError?.(msg),
          onStart: () => live() && callbacks.onStart?.(),
          onEnd: () => live() && callbacks.onEnd?.(),
        });
        if (!ok) this.engine = null;
        return ok;
      }

      return this.startNative(languageCode, callbacks, options, live);
    });
  }

  private async startNative(
    languageCode: string,
    callbacks: SpeechRecognitionCallbacks,
    options: SpeechRecognitionOptions,
    live: () => boolean
  ): Promise<boolean> {
    const base = languageCode.toLowerCase().split('-')[0];
    const lang = languageCode.includes('-') ? languageCode : NATIVE_LANG_MAP[base] ?? languageCode;

    this.engine = 'native';
    this.nativeSubs = [
      ExpoSpeechRecognitionModule.addListener('start', () => live() && callbacks.onStart?.()),
      ExpoSpeechRecognitionModule.addListener('result', (e) => {
        const text = e.results?.[0]?.transcript ?? '';
        if (live() && text) callbacks.onResult(text, e.isFinal ?? false);
      }),
      ExpoSpeechRecognitionModule.addListener('error', (e) => {
        if (!live() || e.error === 'aborted') return;
        if (e.error === 'no-speech' || e.error === 'speech-timeout') {
          callbacks.onEnd?.();
        } else {
          callbacks.onError?.(e.message || e.error || 'Error de reconocimiento');
        }
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        if (!live()) return;
        this.engine = null;
        callbacks.onEnd?.();
      }),
    ];

    try {
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous: options.continuous ?? true,
        contextualStrings: options.contextualStrings?.slice(0, 100),
      });
      return true;
    } catch (e: any) {
      this.removeNativeSubs();
      this.engine = null;
      callbacks.onError?.(e?.message || 'No se pudo iniciar el reconocimiento');
      return false;
    }
  }

  private removeNativeSubs() {
    this.nativeSubs.forEach((s) => s.remove());
    this.nativeSubs = [];
  }

  private async abortNow(invalidate = true): Promise<void> {
    if (invalidate) this.generation++;
    const engine = this.engine;
    this.engine = null;
    this.removeNativeSubs();
    if (engine === 'sherpa') await sherpaVoiceService.abort();
    if (engine === 'native') {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}
    }
  }

  /** Detiene el micrófono inmediatamente y descarta cualquier resultado pendiente. */
  abort(): Promise<void> {
    return this.enqueue(() => this.abortNow());
  }

  stop(): Promise<void> {
    return this.abort();
  }
}

export const speechService = new SpeechRecognitionService();
