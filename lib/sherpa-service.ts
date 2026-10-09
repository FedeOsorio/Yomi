import { PermissionsAndroid, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Reconocimiento de voz offline con Sherpa-ONNX + SenseVoice (ja / zh / en / ko / yue).
 *
 * - El modelo NO viaja dentro del APK: se descarga una sola vez (~230 MB) a la carpeta
 *   interna de la app la primera vez que el usuario elige repasar por voz.
 * - Cada vez que el usuario habla y hace una pausa se transcribe esa "elocución" completa
 *   y se entrega como UN resultado final (un intento).
 */

const MODEL_BASE_URL =
  'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main';
const MODEL_FILES = [
  { name: 'tokens.txt', minBytes: 300_000 },
  { name: 'model.int8.onnx', minBytes: 230_000_000 },
];
export const SHERPA_MODEL_SIZE_MB = 230;

const SENSEVOICE_LANGS: Record<string, string> = { ja: 'ja', zh: 'zh', en: 'en', ko: 'ko', yue: 'yue' };

/** Código de idioma de SenseVoice para un código BCP-47, o null si el modelo no lo soporta. */
export function toSenseVoiceLang(code?: string | null): string | null {
  const base = (code || '').toLowerCase().split('-')[0];
  return SENSEVOICE_LANGS[base] ?? null;
}

export const MODEL_NOT_DOWNLOADED = 'MODEL_NOT_DOWNLOADED';

// Detección de voz (VAD por energía). Todo en milisegundos: el tamaño de cada bloque de
// audio que entrega el micrófono varía según el teléfono (40–100 ms).
const SAMPLE_RATE = 16000;
const SPEECH_START_MS = 120; // voz sostenida necesaria para considerar que empezó a hablar
const END_SILENCE_MS = 650; // pausa que da la palabra por terminada (tolera っ y pausas cortas)
const PRE_ROLL_MS = 450; // audio previo que se conserva para no cortar la primera sílaba
const MIN_UTTERANCE_MS = 300;
const MAX_UTTERANCE_MS = 4000;

const ms = (n: number) => Math.round((n / 1000) * SAMPLE_RATE);

export interface SherpaCallbacks {
  /** Un resultado por elocución (siempre final). */
  onResult: (text: string) => void;
  onError?: (message: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

type SherpaModules = {
  stt: typeof import('react-native-sherpa-onnx/stt');
  audio: typeof import('react-native-sherpa-onnx/audio');
};

let modules: SherpaModules | null | undefined;
function getModules(): SherpaModules | null {
  if (modules !== undefined) return modules;
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    modules = {
      stt: require('react-native-sherpa-onnx/stt'),
      audio: require('react-native-sherpa-onnx/audio'),
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch (err) {
    console.warn('[Sherpa] Módulo nativo no disponible en este binario:', err);
    modules = null;
  }
  return modules;
}

/** Limpia etiquetas <|...|>, puntuación y rellenos que SenseVoice emite ante ruidos. */
function cleanTranscript(raw: string, lang: string): string {
  if (!raw || raw.includes('<|nospeech|>')) return '';
  let text = raw
    .replace(/<\|.*?\|>/g, '')
    .replace(/[。、，！？!?.,:;…〜～・]/g, '')
    .trim();
  text = lang === 'ja' || lang === 'zh' || lang === 'yue' ? text.replace(/\s+/g, '') : text.replace(/\s+/g, ' ');
  const FILLERS = new Set(['ああ', 'ええ', 'えー', 'あの', 'ん', 'うーん', 'えっと', '嗯', '啊', '呃', '哦', '呀', 'っ', 'ー']);
  return FILLERS.has(text) ? '' : text;
}

class SherpaVoiceService {
  private engine: any = null;
  private engineLang = '';
  private loading: Promise<boolean> | null = null;
  private downloading: Promise<boolean> | null = null;
  private stream: any = null;
  private unsubscribers: Array<() => void> = [];
  private callbacks: SherpaCallbacks | null = null;
  private generation = 0;
  lastError: string | null = null;

  isNativeAvailable(): boolean {
    return getModules() !== null;
  }

  // ───────────── Modelo ─────────────

  /** Directorio del modelo como URI (para expo-file-system). */
  private modelDirUri(): string {
    return `${FileSystem.documentDirectory}models/sense-voice`;
  }

  /** Mismo directorio como ruta absoluta SIN "file://" (el código nativo usa java.io.File). */
  private modelDirPath(): string {
    return decodeURI(this.modelDirUri().replace(/^file:\/\//, ''));
  }

  async isModelDownloaded(): Promise<boolean> {
    try {
      for (const f of MODEL_FILES) {
        const info = await FileSystem.getInfoAsync(`${this.modelDirUri()}/${f.name}`);
        if (!info.exists || (info.size ?? 0) < f.minBytes) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** Descarga el modelo (una sola vez). Se descarga a ".part" y se renombra al terminar. */
  downloadModel(onProgress?: (percent: number) => void): Promise<boolean> {
    if (this.downloading) return this.downloading;
    this.downloading = (async () => {
      try {
        const dir = this.modelDirUri();
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
        for (const f of MODEL_FILES) {
          const target = `${dir}/${f.name}`;
          const info = await FileSystem.getInfoAsync(target);
          if (info.exists && (info.size ?? 0) >= f.minBytes) continue;

          const part = `${target}.part`;
          await FileSystem.deleteAsync(part, { idempotent: true });
          const isBig = f.name.endsWith('.onnx');
          const task = FileSystem.createDownloadResumable(`${MODEL_BASE_URL}/${f.name}`, part, {}, (p) => {
            if (isBig && p.totalBytesExpectedToWrite > 0) {
              onProgress?.(Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100));
            }
          });
          const res = await task.downloadAsync();
          const partInfo = await FileSystem.getInfoAsync(part);
          if (!res || res.status !== 200 || !partInfo.exists || (partInfo.size ?? 0) < f.minBytes) {
            await FileSystem.deleteAsync(part, { idempotent: true });
            throw new Error(`Descarga incompleta de ${f.name}`);
          }
          await FileSystem.deleteAsync(target, { idempotent: true });
          await FileSystem.moveAsync({ from: part, to: target });
        }
        onProgress?.(100);
        return true;
      } catch (err: any) {
        this.lastError = err?.message ?? String(err);
        console.warn('[Sherpa] Error descargando el modelo:', err);
        return false;
      } finally {
        this.downloading = null;
      }
    })();
    return this.downloading;
  }

  /** Libera el motor y borra el modelo descargado. */
  async deleteModel(): Promise<void> {
    await this.abort();
    if (this.engine) await this.engine.destroy().catch(() => {});
    this.engine = null;
    this.engineLang = '';
    await FileSystem.deleteAsync(this.modelDirUri(), { idempotent: true });
  }

  isReady(lang?: string): boolean {
    return Boolean(this.engine) && (!lang || this.engineLang === toSenseVoiceLang(lang));
  }

  /** Carga el modelo en memoria para el idioma indicado (reutiliza el motor si ya está cargado). */
  async loadModel(langCode: string): Promise<boolean> {
    const lang = toSenseVoiceLang(langCode);
    if (!lang) return false;
    if (this.engine && this.engineLang === lang) return true;
    if (this.loading) {
      await this.loading;
      if (this.engine && this.engineLang === lang) return true;
    }

    this.loading = (async () => {
      this.lastError = null;
      const m = getModules();
      if (!m) {
        this.lastError = 'El módulo nativo de Sherpa-ONNX no está incluido en esta compilación.';
        return false;
      }
      if (!(await this.isModelDownloaded())) {
        this.lastError = MODEL_NOT_DOWNLOADED;
        return false;
      }
      try {
        if (this.engine) {
          await this.engine.destroy().catch(() => {});
          this.engine = null;
        }
        this.engine = await m.stt.createSTT({
          modelPath: { type: 'file', path: this.modelDirPath() },
          modelType: 'sense_voice',
          preferInt8: true,
          numThreads: 2,
          // ITN desactivado: con ITN el modelo convierte números a dígitos ("とおか" y "じゅうにち" → "10日")
          // y se pierde cómo se pronunció. Sin ITN escribe lo que oyó con kana/kanji.
          modelOptions: { senseVoice: { language: lang, useItn: false } },
        });
        this.engineLang = lang;
        return true;
      } catch (err: any) {
        this.engine = null;
        this.engineLang = '';
        this.lastError = err?.message ?? String(err);
        console.warn('[Sherpa] No se pudo cargar el modelo:', err);
        return false;
      }
    })();

    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }

  // ───────────── Micrófono ─────────────

  private async ensureMicPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const perm = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
    if (await PermissionsAndroid.check(perm)) return true;
    return (await PermissionsAndroid.request(perm)) === PermissionsAndroid.RESULTS.GRANTED;
  }

  isListening(): boolean {
    return this.stream !== null;
  }

  async start(langCode: string, callbacks: SherpaCallbacks): Promise<boolean> {
    await this.abort();
    const gen = ++this.generation;

    if (!(await this.loadModel(langCode))) {
      callbacks.onError?.(this.lastError ?? 'No se pudo cargar el modelo de voz');
      return false;
    }
    if (!(await this.ensureMicPermission())) {
      callbacks.onError?.('Permiso de micrófono denegado');
      return false;
    }
    if (gen !== this.generation) return false; // otra llamada a start/abort llegó mientras cargaba

    const lang = this.engineLang;
    const m = getModules()!;
    let preRoll: number[] = [];
    let utterance: number[] = [];
    let speaking = false;
    let voicedMs = 0;
    let silenceMs = 0;
    let noiseFloor = 0.003;
    let busy = false;

    const pushPreRoll = (samples: Float32Array) => {
      for (let i = 0; i < samples.length; i++) preRoll.push(samples[i]);
      if (preRoll.length > ms(PRE_ROLL_MS)) preRoll = preRoll.slice(preRoll.length - ms(PRE_ROLL_MS));
    };

    const transcribe = async (audio: number[]) => {
      // Normalización suave de volumen para micrófonos con poca ganancia
      let peak = 0;
      for (const v of audio) peak = Math.max(peak, Math.abs(v));
      if (peak < 0.01) return;
      if (peak < 0.6) {
        const gain = Math.min(0.7 / peak, 3);
        for (let i = 0; i < audio.length; i++) audio[i] *= gain;
      }
      busy = true;
      try {
        const result = await this.engine.transcribeSamples(audio, SAMPLE_RATE);
        if (gen !== this.generation) return;
        const text = cleanTranscript(result?.text ?? '', lang);
        console.log('[Sherpa] Elocución:', JSON.stringify(result?.text), '→', JSON.stringify(text));
        if (text) callbacks.onResult(text);
      } catch (err) {
        console.warn('[Sherpa] Error transcribiendo:', err);
      } finally {
        busy = false;
      }
    };

    try {
      const stream = m.audio.createPcmLiveStream({ sampleRate: SAMPLE_RATE, channelCount: 1 });

      const offData = stream.onData((samples: Float32Array, rate: number) => {
        if (gen !== this.generation || samples.length === 0) return;
        const chunkMs = (samples.length / (rate || SAMPLE_RATE)) * 1000;

        let sum = 0;
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
        const rms = Math.sqrt(sum / samples.length);
        if (!speaking) noiseFloor = noiseFloor * 0.95 + Math.min(rms, 0.015) * 0.05;
        const isVoice = rms > Math.max(0.005, Math.min(0.02, noiseFloor * 1.8));

        if (busy || !speaking) {
          // Esperando que empiece a hablar (o transcribiendo el intento anterior)
          pushPreRoll(samples);
          if (busy) return;
          voicedMs = isVoice ? voicedMs + chunkMs : 0;
          if (voicedMs >= SPEECH_START_MS) {
            speaking = true;
            silenceMs = 0;
            utterance = preRoll;
            preRoll = [];
          }
          return;
        }

        for (let i = 0; i < samples.length; i++) utterance.push(samples[i]);
        silenceMs = isVoice ? 0 : silenceMs + chunkMs;

        const ended = silenceMs >= END_SILENCE_MS;
        const tooLong = utterance.length >= ms(MAX_UTTERANCE_MS);
        if (!ended && !tooLong) return;

        speaking = false;
        voicedMs = 0;
        // Quitar el silencio final dejando ~200 ms de cola
        const trim = ended ? Math.max(0, ms(silenceMs - 200)) : 0;
        const audio = utterance.slice(0, utterance.length - trim);
        utterance = [];
        if (audio.length >= ms(MIN_UTTERANCE_MS)) transcribe(audio);
      });

      const offError = stream.onError((msg: string) => {
        if (gen === this.generation) callbacks.onError?.(msg);
      });

      this.unsubscribers = [offData, offError];
      this.stream = stream;
      this.callbacks = callbacks;
      await stream.start();
      if (gen !== this.generation) return false;
      callbacks.onStart?.();
      return true;
    } catch (err: any) {
      await this.abort();
      callbacks.onError?.(err?.message ?? 'No se pudo abrir el micrófono');
      return false;
    }
  }

  /** Detiene el micrófono y notifica onEnd. */
  async stop(): Promise<void> {
    const cb = this.callbacks;
    await this.abort();
    cb?.onEnd?.();
  }

  /** Detiene el micrófono sin notificar y descarta resultados pendientes. */
  async abort(): Promise<void> {
    this.generation++;
    this.callbacks = null;
    this.unsubscribers.forEach((off) => {
      try {
        off();
      } catch {}
    });
    this.unsubscribers = [];
    const stream = this.stream;
    this.stream = null;
    if (stream) await stream.stop().catch(() => {});
  }
}

export const sherpaVoiceService = new SherpaVoiceService();
