import {
  conjugateJapanese,
  getEffectiveCardLanguage,
  JapaneseConjugationForm,
  toNormalizedHiragana,
} from './japanese-utils';
import { buildVoskGrammarForCardWithContext } from './phonetic-dictionary';
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
   * Utiliza de forma estricta la descomposición morfológica y fonética del diccionario
   * sin inyectar distractores de otras tarjetas para evitar alucinaciones acústicas.
   */
  buildGrammarForCard(
    card: DueCardWithContext,
    _allSessionCards?: DueCardWithContext[]
  ): string[] {
    return buildVoskGrammarForCardWithContext(card);
  }

  getVoskGrammarForCard(
    card: DueCardWithContext,
    _lang?: string,
    _allSessionCards?: DueCardWithContext[]
  ): string[] {
    return buildVoskGrammarForCardWithContext(card);
  }

  /**
   * Construye una gramática cerrada de Vosk para la práctica de conjugación actual.
   * Incluye la forma conjugada esperada, sus variantes fonéticas, y las demás
   * formas conjugadas/base de la palabra para que si el usuario conjuga erróneamente,
   * Vosk reconozca el término y la evalúe como incorrecta con feedback inmediato,
   * en lugar de clasificarla como [unk] o ruido en silencio.
   */
  buildGrammarForConjugation(
    kanji: string,
    reading: string,
    category: string = '',
    targetForm?: JapaneseConjugationForm
  ): string[] {
    const grammarSet = new Set<string>();

    const addWordForms = (k?: string, r?: string) => {
      const cleanK = (k || '').trim();
      const cleanR = (r || '').trim();
      if (cleanK && !/^[a-zA-Z\s]+$/.test(cleanK)) {
        grammarSet.add(cleanK);
        if (cleanK.length >= 2) {
          if (cleanK.endsWith('ます')) grammarSet.add(`${cleanK.slice(0, -2)} ます`);
          if (cleanK.endsWith('ました')) grammarSet.add(`${cleanK.slice(0, -3)} ました`);
          if (cleanK.endsWith('ません')) grammarSet.add(`${cleanK.slice(0, -3)} ません`);
          if (cleanK.endsWith('ない')) grammarSet.add(`${cleanK.slice(0, -2)} ない`);
          if (cleanK.endsWith('た')) grammarSet.add(`${cleanK.slice(0, -1)} た`);
          if (cleanK.endsWith('て')) grammarSet.add(`${cleanK.slice(0, -1)} て`);
          if (cleanK.endsWith('です')) grammarSet.add(`${cleanK.slice(0, -2)} です`);
          if (cleanK.endsWith('でした')) grammarSet.add(`${cleanK.slice(0, -3)} でした`);
        }
      }
      if (cleanR && !/^[a-zA-Z\s]+$/.test(cleanR)) {
        const hira = toNormalizedHiragana(cleanR);
        if (hira) {
          grammarSet.add(hira);
          if (hira.endsWith('ます')) grammarSet.add(`${hira.slice(0, -2)} ます`);
          if (hira.endsWith('ました')) grammarSet.add(`${hira.slice(0, -3)} ました`);
          if (hira.endsWith('ません')) grammarSet.add(`${hira.slice(0, -3)} ません`);
          if (hira.endsWith('ない')) grammarSet.add(`${hira.slice(0, -2)} ない`);
          if (hira.endsWith('た')) grammarSet.add(`${hira.slice(0, -1)} た`);
          if (hira.endsWith('て')) grammarSet.add(`${hira.slice(0, -1)} て`);
          if (hira.endsWith('です')) grammarSet.add(`${hira.slice(0, -2)} です`);
          if (hira.endsWith('でした')) grammarSet.add(`${hira.slice(0, -3)} でした`);
          const kata = hira.replace(/[\u3041-\u3096]/g, (ch) =>
            String.fromCharCode(ch.charCodeAt(0) + 0x60)
          );
          if (kata) grammarSet.add(kata);
        }
      }
    };

    // 1. Forma base de diccionario
    addWordForms(kanji, reading);

    // 2. Si se especifica la forma objetivo, asegurar la forma esperada y variantes comunes
    const cat = category || '';
    if (targetForm) {
      const expected = conjugateJapanese(kanji, reading, cat, targetForm);
      addWordForms(expected.kanji, expected.reading);

      const norm = toNormalizedHiragana(expected.reading);
      if (norm.endsWith('なくて')) {
        addWordForms('', norm.replace(/なくて$/, 'ないで'));
      }
      if (norm.endsWith('ないで')) {
        addWordForms('', norm.replace(/ないで$/, 'なくて'));
      }
      if (norm.endsWith('じゃない')) {
        addWordForms('', norm.replace(/じゃない$/, 'ではない'));
      }
      if (norm.endsWith('ではない')) {
        addWordForms('', norm.replace(/ではない$/, 'じゃない'));
      }
      if (norm.endsWith('じゃなかった')) {
        addWordForms('', norm.replace(/じゃなかった$/, 'ではなかった'));
      }
      if (norm.endsWith('ではなかった')) {
        addWordForms('', norm.replace(/ではなかった$/, 'じゃなかった'));
      }
      if (norm.endsWith('じゃなくて')) {
        addWordForms('', norm.replace(/じゃなくて$/, 'ではなくて'));
      }
      if (norm.endsWith('ではなくて')) {
        addWordForms('', norm.replace(/ではなくて$/, 'じゃなくて'));
      }
      if (norm.endsWith('じゃありません')) {
        addWordForms('', norm.replace(/じゃありません$/, 'じゃないです'));
        addWordForms('', norm.replace(/じゃありません$/, 'ではありません'));
      }
      if (norm.endsWith('じゃないです')) {
        addWordForms('', norm.replace(/じゃないです$/, 'じゃありません'));
        addWordForms('', norm.replace(/じゃないです$/, 'ではありません'));
      }
      if (norm.endsWith('くないです')) {
        addWordForms('', norm.replace(/くないです$/, 'くありません'));
      }
      if (norm.endsWith('くありません')) {
        addWordForms('', norm.replace(/くありません$/, 'くないです'));
      }
      if (norm.endsWith('くなかったです')) {
        addWordForms('', norm.replace(/くなかったです$/, 'くありませんでした'));
      }
    }

    // 3. Incluir las demás conjugaciones posibles para capturar respuestas incorrectas
    const allForms: JapaneseConjugationForm[] = [
      'te', 'nakute', 'ta', 'nai', 'nakatta', 'masu', 'mashita', 'masen', 'mashou', 'adverbial'
    ];
    for (const form of allForms) {
      if (form !== targetForm) {
        const other = conjugateJapanese(kanji, reading, cat, form);
        addWordForms(other.kanji, other.reading);
      }
    }

    const validWords = Array.from(grammarSet)
      .map((w) => w.trim())
      .filter((w) => w.length > 0 && w !== '[unk]');

    // Añadir '[unk]' para rechazar ruido ambiental y silencio
    validWords.push('[unk]');

    return validWords;
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

    // Detener incondicionalmente cualquier sesión previa y permitir que AudioRecord se libere
    await this.stop();

    this.generation++;
    const currentGen = this.generation;
    const startTimestamp = Date.now();

    try {
      console.log('[VoskService] Starting recognizer with grammar size:', options?.grammar?.length ?? 'none');

      const resultSub = vosk.onResult((hypothesis: string) => {
        if (this.generation !== currentGen) return;
        if (Date.now() - startTimestamp < 200) return;
        const trimmed = (hypothesis || '').trim();
        console.log('[VoskService] onResult:', trimmed);
        callbacks.onResult(trimmed, true);
      });

      const finalResultSub = vosk.onFinalResult((hypothesis: string) => {
        if (this.generation !== currentGen) return;
        if (Date.now() - startTimestamp < 200) return;
        const trimmed = (hypothesis || '').trim();
        console.log('[VoskService] onFinalResult:', trimmed);
        callbacks.onResult(trimmed, true);
      });

      const partialSub = vosk.onPartialResult((hypothesis: string) => {
        if (this.generation !== currentGen) return;
        if (Date.now() - startTimestamp < 200) return;
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

      this.activeSubscriptions = [resultSub, finalResultSub, partialSub, errorSub, timeoutSub];

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

    // Permitir que el thread de AudioRecord nativo de Android termine de drenar sus buffers
    await new Promise((resolve) => setTimeout(resolve, 80));
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
