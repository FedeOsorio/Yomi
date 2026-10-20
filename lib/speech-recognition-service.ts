import { PermissionsAndroid, Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { modelForLanguage, sherpaVoiceService } from './sherpa-service';
import { getStorageItem, setStorageItem } from './storage-service';

/**
 * Punto de entrada único para el reconocimiento de voz de la app.
 * - Japonés / chino / inglés → Sherpa-ONNX offline (un resultado final por intento).
 *   En japonés, las palabras esperadas se usan como pistas del modelo (ver sherpa-service).
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
  onResult: (transcript: string, isFinal: boolean, alternatives?: string[]) => void;
  onError?: (errorMessage: string) => void;
  onEnd?: () => void;
  onStart?: () => void;
}

export interface SpeechRecognitionOptions {
  /** Palabras esperadas: sesgan el reconocedor nativo y son las pistas del modelo japonés offline. */
  contextualStrings?: string[];
  preferredEngine?: 'auto' | 'native' | 'offline';
  continuous?: boolean;
}

export type SpeechEnginePreference = 'native' | 'offline';

const ENGINE_PREF_KEY = 'yomi_speech_engine_mode';
let cachedEnginePref: SpeechEnginePreference | null = null;

export async function getSpeechEnginePreference(): Promise<SpeechEnginePreference> {
  if (cachedEnginePref) return cachedEnginePref;
  const stored = await getStorageItem(ENGINE_PREF_KEY);
  if (stored === 'offline' || stored === 'native') {
    cachedEnginePref = stored;
    return stored;
  }
  // Por defecto 'native': usa el motor nativo de Google/iOS con el paquete de japonés del celular
  cachedEnginePref = 'native';
  return 'native';
}

export async function setSpeechEnginePreference(pref: SpeechEnginePreference): Promise<void> {
  cachedEnginePref = pref;
  await setStorageItem(ENGINE_PREF_KEY, pref);
}

/** Indica si el idioma se reconoce con el modelo offline (y por lo tanto necesita descargarlo). */
export function usesOfflineModel(languageCode: string): boolean {
  return modelForLanguage(languageCode) !== null;
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

      const pref =
        options.preferredEngine === 'native'
          ? 'native'
          : options.preferredEngine === 'offline'
            ? 'offline'
            : await getSpeechEnginePreference();

      if (pref === 'offline' && usesOfflineModel(languageCode)) {
        this.engine = 'sherpa';
        const ok = await sherpaVoiceService.start(languageCode, {
          onResult: (text) => live() && callbacks.onResult(text, true),
          onError: (msg) => live() && callbacks.onError?.(msg),
          onStart: () => live() && callbacks.onStart?.(),
          onEnd: () => live() && callbacks.onEnd?.(),
        }, options.contextualStrings);
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
        if (!live() || !e.results || e.results.length === 0) return;
        const text = e.results[0]?.transcript ?? '';
        const alternatives = e.results.map((r) => r.transcript).filter(Boolean);
        if (text) callbacks.onResult(text, e.isFinal ?? false, alternatives);
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
        maxAlternatives: 5,
        continuous: options.continuous ?? false,
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
