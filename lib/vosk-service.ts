import {
  getEffectiveCardLanguage,
  toNormalizedHiragana,
} from './japanese-utils';
import { KANJI_READINGS_MAP } from './kanji-readings-db';
import type { DueCardWithContext } from './srs-engine';

export interface VoskCallbacks {
  onResult: (hypothesis: string, isFinal: boolean) => void;
  onError?: (errorMessage: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onTimeout?: () => void;
}

export interface VoskStartOptions {
  grammar?: string[];
  timeout?: number;
}

type VoskModuleType = typeof import('react-native-vosk');

let cachedVoskModule: VoskModuleType | null = null;
let cachedNativeVosk: any = null;
let hasCheckedModule = false;

/**
 * Carga perezosa y segura del módulo nativo react-native-vosk.
 * Protege contra el Invariant Violation de TurboModuleRegistry.getEnforcing
 * cuando la app se ejecuta sobre un binario nativo que aún no fue recompilado.
 */
function getVoskModule(): VoskModuleType | null {
  if (hasCheckedModule) return cachedVoskModule;
  hasCheckedModule = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-vosk');
    if (mod && typeof mod.loadModel === 'function') {
      cachedVoskModule = mod;
      return cachedVoskModule;
    }
  } catch (err) {
    console.warn(
      '[VoskService] react-native-vosk native module is not present in this binary build. Run "npx expo run:android" to compile it.',
      err
    );
  }
  return null;
}

/**
 * Obtiene el TurboModule nativo directo de Vosk para iniciar el recognizer
 * instantáneamente (<5ms) sin pasar por PermissionsAndroid.request en JS
 * (los permisos ya fueron verificados previamente al entrar a la sesión).
 */
function getNativeVoskDirect(): any {
  if (cachedNativeVosk) return cachedNativeVosk;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TurboModuleRegistry } = require('react-native');
    cachedNativeVosk = TurboModuleRegistry?.get('Vosk') || null;
    return cachedNativeVosk;
  } catch {
    return null;
  }
}

/**
 * Genera variantes fonéticas con sonido prolongado (ー y duplicación vocálica)
 * para monosílabos de 1 mora (ej. じ -> じー, じい, ジー; き -> きー, きい, キー; しょ -> しょー, しょう).
 * Permite que Kaldi decodifique la duración natural de una persona hablando (250-400ms)
 * sin penalizar el monosílabo ni confundirlo con disílabos competidores (como とき).
 */
function getMonoraProlongations(hira: string): string[] {
  if (!hira) return [];
  const isSingleKana = hira.length === 1;
  const isYouon = hira.length === 2 && 'ゃゅょぁぃぅぇぉ'.includes(hira[1]);
  if (!isSingleKana && !isYouon) return [];

  const prolonged: string[] = [];
  prolonged.push(hira + 'ー');

  const lastChar = hira[hira.length - 1];
  if ('いきしちにひみりぎじぢびぴぃ'.includes(lastChar)) {
    prolonged.push(hira + 'い');
  } else if ('あかさたなはまやらわがざだばぱゃぁ'.includes(lastChar)) {
    prolonged.push(hira + 'あ');
  } else if ('うくすつぬふむゆるぐずづぶぷゅぅ'.includes(lastChar)) {
    prolonged.push(hira + 'う');
  } else if ('えけせてねへめれげぜでべぺぇ'.includes(lastChar)) {
    prolonged.push(hira + 'え');
    prolonged.push(hira + 'い');
  } else if ('おこそとのほもよろごぞどぼぽょぉ'.includes(lastChar)) {
    prolonged.push(hira + 'う');
    prolonged.push(hira + 'お');
  }

  return prolonged;
}

/**
 * Extrae los prefijos progresivos por mora de una lectura en hiragana.
 * Permite que Kaldi emita hipótesis parciales inmediatas (<150ms) mientras el usuario pronuncia,
 * logrando un feedback en vivo instantáneo en pantalla.
 * Ej: 'のむ' -> ['の']
 *     'たべる' -> ['た', 'たべ']
 *     'びょういん' -> ['びょう', 'びょうい']
 */
function getMoraPrefixes(hira: string): string[] {
  if (!hira || hira.length <= 1) return [];
  const moras: string[] = [];
  let i = 0;
  while (i < hira.length) {
    let mora = hira[i];
    if (i + 1 < hira.length && 'ゃゅょぁぃぅぇぉャュョァィゥェォ'.includes(hira[i + 1])) {
      mora += hira[i + 1];
      i += 2;
    } else {
      i += 1;
    }
    moras.push(mora);
  }

  const prefixes: string[] = [];
  let accum = '';
  for (let m = 0; m < moras.length - 1; m++) {
    accum += moras[m];
    prefixes.push(accum);
  }
  return prefixes;
}

class VoskVoiceService {
  private isModelLoaded = false;
  private modelLoadPromise: Promise<boolean> | null = null;
  private isListeningActive = false;
  private activeSubscriptions: Array<{ remove: () => void }> = [];
  private currentModelName = 'model-ja-jp';
  private generation = 0;
  private isNativeAvailable: boolean | null = null;

  /**
   * Verifica si el módulo nativo de Vosk está enlazado y disponible en el binario actual.
   */
  checkNativeModule(): boolean {
    if (this.isNativeAvailable !== null) return this.isNativeAvailable;
    const mod = getVoskModule();
    this.isNativeAvailable = Boolean(mod && typeof mod.loadModel === 'function');
    return this.isNativeAvailable;
  }

  /**
   * Carga el modelo acústico offline (por defecto 'model-ja-jp') en memoria.
   * Si ya fue cargado, retorna de inmediato.
   */
  async loadModel(modelName: string = 'model-ja-jp'): Promise<boolean> {
    if (this.isModelLoaded && this.currentModelName === modelName) {
      return true;
    }

    const vosk = getVoskModule();
    if (!vosk) {
      return false;
    }

    if (this.modelLoadPromise) {
      await this.modelLoadPromise;
      if (this.isModelLoaded && this.currentModelName === modelName) {
        return true;
      }
    }

    const loadPromise = (async () => {
      try {
        console.log(`[VoskService] Loading acoustic model: ${modelName}`);
        await vosk.loadModel(modelName);
        this.isModelLoaded = true;
        this.currentModelName = modelName;
        console.log(`[VoskService] Model ${modelName} successfully loaded`);
        return true;
      } catch (err) {
        console.error(`[VoskService] Failed to load model ${modelName}:`, err);
        this.isModelLoaded = false;
        return false;
      }
    })();

    this.modelLoadPromise = loadPromise;
    try {
      return await loadPromise;
    } finally {
      if (this.modelLoadPromise === loadPromise) {
        this.modelLoadPromise = null;
      }
    }
  }

  /**
   * Retorna si el modelo está listo para realizar inferencia.
   */
  isReady(): boolean {
    return this.isModelLoaded;
  }

  /**
   * Retorna si el micrófono está escuchando activamente con Vosk.
   */
  isListening(): boolean {
    return this.isListeningActive;
  }

  /**
   * Construye el array de gramática específico y cerrado para una tarjeta dada.
   * Este subconjunto fuerza al decodificador Kaldi a considerar exclusivamente
   * las lecturas y representaciones válidas de la tarjeta, más '[unk]' para rechazos.
   */
  buildGrammarForCard(card: DueCardWithContext): string[] {
    const rawTokens: string[] = [];

    // 1. Texto principal (Kanji o palabra)
    if (card.displayText) {
      const text = card.displayText.trim();
      if (text) rawTokens.push(text);
    }

    // 2. Lectura directa configurada en la tarjeta
    if (card.displayReading) {
      card.displayReading.split(/[\/\n,、;•|]/).forEach((p) => {
        const clean = p.replace(/^(on|kun|音|訓)[:：\s]*/i, '').trim();
        if (clean) rawTokens.push(clean);
      });
    }

    // 3. Información auxiliar de lecturas (On / Kun / kanjiReadings)
    if (card.auxiliaryInfo) {
      try {
        const aux = JSON.parse(card.auxiliaryInfo);
        if (aux.kanjiReadings) {
          aux.kanjiReadings.split(/[\/\n,、;•|]/).forEach((p: string) => {
            const clean = p.replace(/^(on|kun|音|訓)[:：\s]*/i, '').trim();
            if (clean) rawTokens.push(clean);
          });
        }
        if (aux.onReading) {
          aux.onReading.split(/[,、\s]+/).forEach((p: string) => {
            const clean = p.trim();
            if (clean) rawTokens.push(clean);
          });
        }
        if (aux.kunReading) {
          aux.kunReading.split(/[,、\s]+/).forEach((p: string) => {
            const clean = p.trim();
            if (clean) rawTokens.push(clean);
          });
        }
      } catch { }
    }

    const effectiveLang = getEffectiveCardLanguage(card);
    const isJapanese = effectiveLang.toLowerCase().startsWith('ja');

    const grammarSet = new Set<string>();

    // Añadir el kanji o término principal de la tarjeta (evitando meter romaji latino a Vosk japonés)
    rawTokens.forEach((tok) => {
      const cleanTok = tok.trim();
      if (cleanTok && (!isJapanese || !/^[a-zA-Z\s]+$/.test(cleanTok))) {
        grammarSet.add(cleanTok);
      }
    });

    if (isJapanese) {
      // 1. Extraer lecturas canónicas directas de la tarjeta
      const directReadings: string[] = [];
      if (card.displayReading) {
        card.displayReading.split(/[\/\n,、;•|]/).forEach((p) => {
          const clean = p.replace(/^(on|kun|音|訓)[:：\s]*/i, '').replace(/[・~～\s\(\)（）\-\.]/g, '').trim();
          if (clean) directReadings.push(clean);
        });
      }

      if (card.auxiliaryInfo) {
        try {
          const aux = JSON.parse(card.auxiliaryInfo);
          if (aux.kanjiReadings) {
            aux.kanjiReadings.split(/[\/\n,、;•|]/).forEach((p: string) => {
              const clean = p.replace(/^(on|kun|音|訓)[:：\s]*/i, '').replace(/[・~～\s\(\)（）\-\.]/g, '').trim();
              if (clean) directReadings.push(clean);
            });
          }
          if (aux.onReading) {
            aux.onReading.split(/[,、\s]+/).forEach((p: string) => {
              const clean = p.replace(/[・~～\s\(\)（）\-\.]/g, '').trim();
              if (clean) directReadings.push(clean);
            });
          }
          if (aux.kunReading) {
            aux.kunReading.split(/[,、\s]+/).forEach((p: string) => {
              const clean = p.replace(/[・~～\s\(\)（）\-\.]/g, '').trim();
              if (clean) directReadings.push(clean);
            });
          }
        } catch { }
      }

      const kanjiChar = (card.displayText || '').trim();
      if (directReadings.length === 0 && kanjiChar.length === 1 && KANJI_READINGS_MAP[kanjiChar]) {
        KANJI_READINGS_MAP[kanjiChar].forEach((r) => {
          const clean = r.replace(/[・~～\s\(\)（）\-\.]/g, '').trim();
          if (clean) directReadings.push(clean);
        });
      }

      // 2. Expandir EXCLUSIVAMENTE para estas lecturas directas: Hiragana, Katakana y variantes prolongadas
      directReadings.forEach((r) => {
        const hira = toNormalizedHiragana(r);
        if (hira) {
          grammarSet.add(hira);
          const kata = hira.replace(/[\u3041-\u3096]/g, (ch) =>
            String.fromCharCode(ch.charCodeAt(0) + 0x60)
          );
          if (kata) grammarSet.add(kata);

          // Si es un monosílabo (ej. じ, き, ひ, て, め), incorporar sus variantes acústicas
          // prolongadas que representan la duración natural de una persona al hablar (250-400ms).
          // Esto evita que Kaldi penalice duraciones de monosílabos y los confunda con disílabos (como とき).
          const prolongations = getMonoraProlongations(hira);
          for (const p of prolongations) {
            grammarSet.add(p);
            const pKata = p.replace(/[\u3041-\u3096]/g, (ch) =>
              String.fromCharCode(ch.charCodeAt(0) + 0x60)
            );
            if (pKata) grammarSet.add(pKata);
          }
        }
      });
    }

    // Filtrar caracteres vacíos o duplicados
    const validWords = Array.from(grammarSet)
      .map((w) => w.trim())
      .filter((w) => w.length > 0 && w !== '[unk]');

    // Esencial: Token de descarte '[unk]' para rechazar cualquier pronunciación que no sea de esta tarjeta
    validWords.push('[unk]');

    return validWords;
  }

  getVoskGrammarForCard(card: DueCardWithContext, _lang?: string): string[] {
    return this.buildGrammarForCard(card);
  }

  /**
   * Inicia la sesión de reconocimiento de voz usando Vosk con la gramática dada.
   */
  async start(
    callbacks: VoskCallbacks,
    options?: VoskStartOptions
  ): Promise<boolean> {
    const vosk = getVoskModule();
    if (!vosk) {
      callbacks.onError?.('NATIVE_MODULE_NOT_AVAILABLE');
      return false;
    }

    if (!this.isModelLoaded) {
      const loaded = await this.loadModel(this.currentModelName);
      if (!loaded) {
        callbacks.onError?.('MODEL_NOT_READY');
        return false;
      }
    }

    // Solo detener escucha previa si estaba efectivamente activo
    if (this.isListeningActive) {
      await this.stop();
    }

    this.generation++;
    const currentGen = this.generation;

    try {
      console.log('[VoskService] Starting recognizer with grammar size:', options?.grammar?.length ?? 'none');

      const resultSub = vosk.onResult((hypothesis: string) => {
        if (this.generation !== currentGen) return;
        const trimmed = (hypothesis || '').trim();
        console.log('[VoskService] onResult:', trimmed);
        callbacks.onResult(trimmed, true);
      });

      const partialSub = vosk.onPartialResult((hypothesis: string) => {
        if (this.generation !== currentGen) return;
        const trimmed = (hypothesis || '').trim();
        if (trimmed) {
          console.log('[VoskService] onPartialResult:', trimmed);
          callbacks.onResult(trimmed, false);
        }
      });

      const errorSub = vosk.onError((err: any) => {
        if (this.generation !== currentGen) return;
        console.warn('[VoskService] onError:', err);
        this.isListeningActive = false;
        callbacks.onError?.(typeof err === 'string' ? err : 'Vosk recognition error');
      });

      const timeoutSub = vosk.onTimeout(() => {
        if (this.generation !== currentGen) return;
        console.log('[VoskService] onTimeout');
        this.isListeningActive = false;
        callbacks.onTimeout?.();
        callbacks.onEnd?.();
      });

      this.activeSubscriptions = [resultSub, partialSub, errorSub, timeoutSub];

      const startOptions: any = {};
      if (options?.grammar && options.grammar.length > 0) {
        startOptions.grammar = options.grammar;
      }
      if (options?.timeout) {
        startOptions.timeout = options.timeout;
      }

      // Prioridad 1: Usar TurboModule nativo directo para inicio inmediato (<10ms) sin pasar por PermissionsAndroid.request
      const nativeVosk = getNativeVoskDirect();
      try {
        if (nativeVosk && typeof nativeVosk.start === 'function') {
          await nativeVosk.start(startOptions);
        } else {
          await vosk.start(startOptions);
        }
      } catch (nativeErr: any) {
        // Auto-recuperación resiliente: si el motor nativo de Android quedó en "already in use",
        // forzar cleanRecognizer() mediante stop() y reintentar de inmediato
        const msg = String(nativeErr?.message || nativeErr || '');
        if (msg.includes('already in use') || msg.includes('use')) {
          console.warn('[VoskService] Engine was in use, resetting native audio stream and retrying...');
          try {
            if (nativeVosk?.stop) nativeVosk.stop();
            else vosk.stop();
          } catch { }
          if (nativeVosk && typeof nativeVosk.start === 'function') {
            await nativeVosk.start(startOptions);
          } else {
            await vosk.start(startOptions);
          }
        } else {
          throw nativeErr;
        }
      }

      this.isListeningActive = true;
      callbacks.onStart?.();
      return true;
    } catch (err: any) {
      console.error('[VoskService] Error starting Vosk:', err);
      this.isListeningActive = false;
      this.cleanupSubscriptions();
      try {
        const nativeVosk = getNativeVoskDirect();
        if (nativeVosk?.stop) nativeVosk.stop();
        else vosk.stop();
      } catch { }
      callbacks.onError?.(err?.message || 'Error starting Vosk recognizer');
      return false;
    }
  }

  /**
   * Detiene el stream de audio actual de Vosk.
   */
  async stop(): Promise<void> {
    this.generation++;
    this.isListeningActive = false;
    this.cleanupSubscriptions();

    try {
      const nativeVosk = getNativeVoskDirect();
      if (nativeVosk && typeof nativeVosk.stop === 'function') {
        nativeVosk.stop();
      } else {
        const vosk = getVoskModule();
        if (vosk) {
          vosk.stop();
        }
      }
    } catch {
      // Ignorar errores benignos si el recognizer no estaba activo
    }
  }

  /**
   * Libera por completo el modelo y el motor Vosk de memoria.
   */
  unload(): void {
    this.stop();
    const vosk = getVoskModule();
    if (vosk) {
      try {
        vosk.unload();
      } catch { }
    }
    this.isModelLoaded = false;
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
}

export const voskVoiceService = new VoskVoiceService();
