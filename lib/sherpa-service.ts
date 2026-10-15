import { PermissionsAndroid, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Reconocimiento de voz offline con Sherpa-ONNX. Un modelo por idioma:
 *
 * - Japonés → ReazonSpeech (zipformer transducer, ~160 MB). Acepta "pistas" (hotwords): al cargarlo
 *   se le pasan las palabras de la sesión y el modelo se inclina hacia ellas cuando el audio es
 *   dudoso (まん en vez de ま), sin inventarlas si no se dijeron.
 * - Chino e inglés → SenseVoice (~230 MB).
 *
 * Los modelos NO viajan dentro del APK: el usuario los descarga desde Configuración.
 * Cada vez que el usuario habla y hace una pausa se transcribe esa "elocución" completa
 * y se entrega como UN resultado final (un intento).
 */

export type VoiceModelId = 'reazon-ja' | 'sensevoice';

interface ModelSpec {
  /** Carpeta dentro de documentDirectory/models */
  dir: string;
  /** Se prueba cada URL base en orden hasta que una funcione. */
  baseUrls: string[];
  files: { name: string; minBytes: number }[];
  sizeMb: number;
  langs: string[];
}

const MODELS: Record<VoiceModelId, ModelSpec> = {
  'reazon-ja': {
    dir: 'reazonspeech-ja',
    baseUrls: [
      'https://huggingface.co/csukuangfj/sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01/resolve/main',
      'https://huggingface.co/reazon-research/reazonspeech-k2-v2/resolve/main',
    ],
    files: [
      { name: 'tokens.txt', minBytes: 40_000 },
      { name: 'decoder-epoch-99-avg-1.int8.onnx', minBytes: 2_500_000 },
      { name: 'joiner-epoch-99-avg-1.int8.onnx', minBytes: 2_500_000 },
      { name: 'encoder-epoch-99-avg-1.int8.onnx', minBytes: 150_000_000 },
    ],
    sizeMb: 160,
    langs: ['ja'],
  },
  sensevoice: {
    dir: 'sense-voice',
    baseUrls: ['https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main'],
    files: [
      { name: 'tokens.txt', minBytes: 300_000 },
      { name: 'model.int8.onnx', minBytes: 230_000_000 },
    ],
    sizeMb: 230,
    langs: ['zh', 'en'],
  },
};

export const VOICE_MODEL_IDS = Object.keys(MODELS) as VoiceModelId[];
export const voiceModelSizeMb = (id: VoiceModelId) => MODELS[id].sizeMb;

const baseLang = (code?: string | null) => (code || '').toLowerCase().split('-')[0];

/** Modelo offline que reconoce el idioma, o null si ninguno (se usa el reconocedor nativo). */
export function modelForLanguage(code?: string | null): VoiceModelId | null {
  const lang = baseLang(code);
  return VOICE_MODEL_IDS.find((id) => MODELS[id].langs.includes(lang)) ?? null;
}

/** Peso de las pistas: cuánto se inclina el modelo hacia las palabras de la sesión. */
// 1.5 (el valor por defecto de sherpa-onnx): con 2.0 el modelo intercalaba kanas de las pistas.
const HOTWORDS_SCORE = 1.5;
/** Máximo de pistas cargadas (cada tarjeta aporta su palabra y sus lecturas). */
const MAX_HOTWORDS = 3000;
/** Signos que no forman parte de una pista. */
const HOTWORD_NOISE = /[\s。、，．！？!?,.:;・~～\-_'"「」『』（）()[\]【】<>/|]/g;

export const MODEL_NOT_DOWNLOADED = 'MODEL_NOT_DOWNLOADED';

// Detección de voz (VAD por energía). Todo en milisegundos: el tamaño de cada bloque de
// audio que entrega el micrófono varía según el teléfono (40–100 ms).
const SAMPLE_RATE = 16000;
const SPEECH_START_MS = 120; // voz sostenida necesaria para considerar que empezó a hablar
const END_SILENCE_MS = 650; // pausa que da la palabra por terminada (tolera っ y pausas cortas)
const PRE_ROLL_MS = 450; // audio previo que se conserva para no cortar la primera sílaba
const MIN_UTTERANCE_MS = 300;
const MAX_UTTERANCE_MS = 4000;
const PAD_BEFORE_MS = 250; // silencio agregado al inicio del audio que se transcribe
const PAD_AFTER_MS = 600; // y al final (para que el modelo no corte la ん final)

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
  /** Qué está cargado: modelo + idioma + pistas (si cambia algo, se recarga). */
  private engineKey = '';
  private engineModel: VoiceModelId | null = null;
  private engineLang = '';
  private loading: Promise<boolean> | null = null;
  private downloading: Partial<Record<VoiceModelId, Promise<boolean>>> = {};
  private stream: any = null;
  private unsubscribers: Array<() => void> = [];
  private callbacks: SherpaCallbacks | null = null;
  private generation = 0;
  /** Pistas para la próxima carga del modelo japonés (palabras de la sesión). */
  private vocabulary: string[] = [];
  /** Caracteres que conoce el modelo japonés (una pista con otro carácter se descarta). */
  private tokenSet: Set<string> | null = null;
  lastError: string | null = null;

  isNativeAvailable(): boolean {
    return getModules() !== null;
  }

  // ───────────── Archivos del modelo ─────────────

  /** Directorio del modelo como URI (para expo-file-system). */
  private modelDirUri(id: VoiceModelId): string {
    return `${FileSystem.documentDirectory}models/${MODELS[id].dir}`;
  }

  /** Ruta absoluta SIN "file://" (el código nativo usa java.io.File). */
  private toNativePath(uri: string): string {
    return decodeURI(uri.replace(/^file:\/\//, ''));
  }

  async isModelDownloaded(id: VoiceModelId): Promise<boolean> {
    try {
      for (const f of MODELS[id].files) {
        const info = await FileSystem.getInfoAsync(`${this.modelDirUri(id)}/${f.name}`);
        if (!info.exists || (info.size ?? 0) < f.minBytes) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** ¿Está descargado el modelo que necesita este idioma? (true si el idioma no usa modelo offline) */
  async hasModelFor(langCode: string): Promise<boolean> {
    const id = modelForLanguage(langCode);
    return id ? this.isModelDownloaded(id) : true;
  }

  /** Descarga un modelo (una sola vez). Cada archivo baja a ".part" y se renombra al terminar. */
  downloadModel(id: VoiceModelId, onProgress?: (percent: number) => void): Promise<boolean> {
    const running = this.downloading[id];
    if (running) return running;
    const spec = MODELS[id];
    const task = (async () => {
      try {
        const dir = this.modelDirUri(id);
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
        for (const f of spec.files) {
          const target = `${dir}/${f.name}`;
          const info = await FileSystem.getInfoAsync(target);
          if (info.exists && (info.size ?? 0) >= f.minBytes) continue;

          const part = `${target}.part`;
          const isBig = f.minBytes >= 100_000_000;
          let ok = false;
          for (const base of spec.baseUrls) {
            await FileSystem.deleteAsync(part, { idempotent: true });
            const dl = FileSystem.createDownloadResumable(`${base}/${f.name}`, part, {}, (p) => {
              if (isBig && p.totalBytesExpectedToWrite > 0) {
                onProgress?.(Math.round((p.totalBytesWritten / p.totalBytesExpectedToWrite) * 100));
              }
            });
            const res = await dl.downloadAsync().catch(() => null);
            const partInfo = await FileSystem.getInfoAsync(part);
            if (res && res.status === 200 && partInfo.exists && (partInfo.size ?? 0) >= f.minBytes) {
              ok = true;
              break;
            }
          }
          if (!ok) {
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
        delete this.downloading[id];
      }
    })();
    this.downloading[id] = task;
    return task;
  }

  /** Libera el motor (si usa ese modelo) y borra el modelo descargado. */
  async deleteModel(id: VoiceModelId): Promise<void> {
    if (this.engineModel === id) {
      await this.abort();
      await this.unloadEngine();
    }
    if (id === 'reazon-ja') this.tokenSet = null;
    await FileSystem.deleteAsync(this.modelDirUri(id), { idempotent: true });
  }

  private async unloadEngine(): Promise<void> {
    if (this.engine) await this.engine.destroy().catch(() => {});
    this.engine = null;
    this.engineKey = '';
    this.engineModel = null;
    this.engineLang = '';
  }

  // ───────────── Pistas (hotwords) ─────────────

  /**
   * Palabras que pueden aparecer en la sesión (escritura y lecturas de cada tarjeta).
   * Solo las usa el modelo japonés. Si hay palabras nuevas, el modelo se recarga en la próxima
   * carga; se conservan las anteriores para no recargar al ir y volver entre pantallas.
   */
  setVocabulary(words: string[]): void {
    // Una sola letra/kana no se usa como pista: inclinaría al modelo hacia sonidos sueltos (お, さ…)
    const clean = Array.from(new Set(words.map((w) => (w || '').replace(HOTWORD_NOISE, '')).filter((w) => [...w].length >= 2)));
    const merged = new Set(this.vocabulary);
    const before = merged.size;
    clean.forEach((w) => merged.add(w));
    if (merged.size === before) return;
    const list = [...merged];
    // Si se pasa del máximo, se quedan solo las palabras de la sesión nueva
    this.vocabulary = list.length > MAX_HOTWORDS ? clean.slice(0, MAX_HOTWORDS) : list;
  }

  private async loadTokenSet(id: VoiceModelId): Promise<Set<string>> {
    if (this.tokenSet) return this.tokenSet;
    const raw = await FileSystem.readAsStringAsync(`${this.modelDirUri(id)}/tokens.txt`);
    this.tokenSet = new Set(raw.split('\n').map((line) => line.split(/\s+/)[0]).filter(Boolean));
    return this.tokenSet;
  }

  /** Escribe el archivo de pistas (solo palabras que el modelo sabe escribir). Devuelve su ruta o ''. */
  private async writeHotwordsFile(id: VoiceModelId, words: string[]): Promise<string> {
    if (words.length === 0) return '';
    const tokens = await this.loadTokenSet(id);
    const lines = words.filter((w) => [...w].every((ch) => tokens.has(ch)));
    if (lines.length === 0) return '';
    const uri = `${FileSystem.documentDirectory}models/hotwords-ja.txt`;
    await FileSystem.writeAsStringAsync(uri, lines.join('\n') + '\n');
    return this.toNativePath(uri);
  }

  // ───────────── Carga en memoria ─────────────

  private wantedKey(id: VoiceModelId, lang: string): string {
    return id === 'reazon-ja' ? `${id}|${this.vocabulary.join('\u0001')}` : `${id}|${lang}`;
  }

  /** ¿Está cargado y al día (mismo modelo/idioma y mismas pistas)? */
  isReady(langCode?: string): boolean {
    if (!this.engine) return false;
    if (!langCode) return true;
    const id = modelForLanguage(langCode);
    return id !== null && this.engineKey === this.wantedKey(id, baseLang(langCode));
  }

  /** Carga el modelo del idioma en memoria (reutiliza el motor si ya está cargado y al día). */
  async loadModel(langCode: string): Promise<boolean> {
    const id = modelForLanguage(langCode);
    const lang = baseLang(langCode);
    if (!id) return false;
    if (this.isReady(langCode)) return true;
    if (this.loading) {
      await this.loading;
      if (this.isReady(langCode)) return true;
    }

    this.loading = (async () => {
      this.lastError = null;
      const m = getModules();
      if (!m) {
        this.lastError = 'El módulo nativo de Sherpa-ONNX no está incluido en esta compilación.';
        return false;
      }
      if (!(await this.isModelDownloaded(id))) {
        this.lastError = MODEL_NOT_DOWNLOADED;
        return false;
      }
      const key = this.wantedKey(id, lang);
      try {
        await this.unloadEngine();
        const modelPath = { type: 'file' as const, path: this.toNativePath(this.modelDirUri(id)) };
        if (id === 'reazon-ja') {
          const hotwordsFile = await this.writeHotwordsFile(id, this.vocabulary);
          this.engine = await m.stt.createSTT({
            modelPath,
            modelType: 'transducer',
            preferInt8: true,
            numThreads: 2,
            modelingUnit: 'cjkchar',
            ...(hotwordsFile ? { hotwordsFile, hotwordsScore: HOTWORDS_SCORE } : {}),
          });
        } else {
          this.engine = await m.stt.createSTT({
            modelPath,
            modelType: 'sense_voice',
            preferInt8: true,
            numThreads: 2,
            // ITN desactivado: con ITN el modelo convierte números a dígitos y se pierde cómo se pronunció.
            modelOptions: { senseVoice: { language: lang, useItn: false } },
          });
        }
        this.engineKey = key;
        this.engineModel = id;
        this.engineLang = lang;
        return true;
      } catch (err: any) {
        await this.unloadEngine();
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
      // Silencio digital antes y después: en palabras de una sílaba el modelo tiende a descartar
      // el último sonido si queda pegado al borde del audio (まん → ま, でん → で).
      const padded = [...new Array(ms(PAD_BEFORE_MS)).fill(0), ...audio, ...new Array(ms(PAD_AFTER_MS)).fill(0)];
      busy = true;
      try {
        const result = await this.engine.transcribeSamples(padded, SAMPLE_RATE);
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
        // No se recorta la cola: los sonidos finales suaves (la ん de でん, las vocales que se apagan)
        // tienen poca energía y el detector los cuenta como silencio; recortarlos los borraba.
        const audio = utterance;
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
