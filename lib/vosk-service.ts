import {
  conjugateJapanese,
  getEffectiveCardLanguage,
  getJapaneseCalendarExpansions,
  JA_CURRENCY_MAP,
  JA_NUMBERS,
  JapaneseConjugationForm,
  normalizeJapaneseCalendarText,
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

/**
 * Descompone un compuesto kanji y su lectura kana en morfemas segmentados separados por espacio para Kaldi/Vosk.
 * Por ejemplo:
 * - displayText: '千円', displayReading: 'せんえん' -> ['千 円', 'せん えん']
 * - displayText: '学生', displayReading: 'がくせい' -> ['学 生', 'がく せい']
 * - displayText: '日本語', displayReading: 'にほんご' -> ['日 本 語', 'にほん ご']
 */
function getKaldiMorphemePhrases(kanjiText: string, kanaReading: string): string[] {
  const phrases: string[] = [];
  const cleanK = (kanjiText || '').replace(/[^\u4e00-\u9faf]/g, '').trim();
  const cleanR = toNormalizedHiragana(kanaReading || '');

  // 1. Descomposición kanji carácter por carácter separados por espacio
  if (cleanK.length >= 2) {
    phrases.push([...cleanK].join(' '));
  }

  // 2. Descomposición de la lectura kana usando el mapa de lecturas canónicas
  if (cleanK.length >= 2 && cleanR) {
    const chars = [...cleanK];
    if (chars.length === 2) {
      const c1Readings = KANJI_READINGS_MAP[chars[0]] || [];
      const c2Readings = KANJI_READINGS_MAP[chars[1]] || [];
      let foundExact = false;
      for (const r1 of c1Readings) {
        const normR1 = toNormalizedHiragana(r1);
        if (normR1 && cleanR.startsWith(normR1) && normR1.length < cleanR.length) {
          const rem = cleanR.slice(normR1.length);
          for (const r2 of c2Readings) {
            const normR2 = toNormalizedHiragana(r2);
            if (rem === normR2) {
              phrases.push(`${normR1} ${normR2}`);
              foundExact = true;
              break;
            }
          }
          if (foundExact) break;
        }
      }
      if (!foundExact && cleanR.length >= 3) {
        const mid = Math.floor(cleanR.length / 2);
        phrases.push(`${cleanR.slice(0, mid)} ${cleanR.slice(mid)}`);
      }
    } else if (chars.length === 3 && cleanR.length >= 3) {
      const c3 = chars[2];
      const c3Readings = KANJI_READINGS_MAP[c3] || [];
      let found3 = false;
      for (const r3 of c3Readings) {
        const normR3 = toNormalizedHiragana(r3);
        if (normR3 && cleanR.endsWith(normR3) && cleanR.length > normR3.length) {
          const prefix = cleanR.slice(0, cleanR.length - normR3.length);
          phrases.push(`${prefix} ${normR3}`);
          found3 = true;
          break;
        }
      }
      if (!found3) {
        phrases.push(`${cleanR.slice(0, 2)} ${cleanR.slice(2)}`);
      }
    }
  }

  // 3. Si la lectura kana tiene terminaciones verbales comunes (ej. たべます -> たべ ます)
  if (cleanR.length >= 3) {
    if (cleanR.endsWith('ます')) {
      phrases.push(`${cleanR.slice(0, -2)} ます`);
    } else if (cleanR.endsWith('ない')) {
      phrases.push(`${cleanR.slice(0, -2)} ない`);
    } else if (cleanR.endsWith('た')) {
      phrases.push(`${cleanR.slice(0, -1)} た`);
    } else if (cleanR.endsWith('て')) {
      phrases.push(`${cleanR.slice(0, -1)} て`);
    }
  }

  return phrases;
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
        // Si es un compuesto de kanjis de 2 o más caracteres, añadir también sus morfemas separados para Kaldi
        if (isJapanese && /^[\u4e00-\u9faf]{2,}$/.test(cleanTok)) {
          grammarSet.add([...cleanTok].join(' '));
        }
      }
    });

    if (isJapanese) {
      // 1. Detección y expansión automática de calendario (días de semana, meses, 1 a 31 días)
      // Genera las formas kanji, los morfemas separados para Kaldi/Vosk (ej. "三 日") y kana
      rawTokens.forEach((tok) => {
        const calExp = getJapaneseCalendarExpansions(tok);
        calExp.forEach((exp) => grammarSet.add(exp));

        // Normalizar números arábigos a kanji en el token (ej. "3日" -> "三日")
        const normCal = normalizeJapaneseCalendarText(tok);
        if (normCal && normCal !== tok) {
          grammarSet.add(normCal);
          const normExp = getJapaneseCalendarExpansions(normCal);
          normExp.forEach((exp) => grammarSet.add(exp));
        }

        // Si coincide con números generales JA_NUMBERS
        if (JA_NUMBERS[tok]) {
          grammarSet.add(JA_NUMBERS[tok].kanji);
          grammarSet.add(JA_NUMBERS[tok].kana);
        }

        // Si coincide con montos de moneda japonesa JA_CURRENCY_MAP (ej. "千円", "1000円")
        if (JA_CURRENCY_MAP[tok]) {
          const c = JA_CURRENCY_MAP[tok];
          grammarSet.add(c.kanji);
          grammarSet.add(c.kana);
          grammarSet.add([...c.kanji].join(' '));
          if (c.kanji === '千円') grammarSet.add('せん えん');
          if (c.kanji === '百円') grammarSet.add('ひゃく えん');
          if (c.kanji === '一万円') grammarSet.add('いち まん えん');
          if (c.kanji === '五百円') grammarSet.add('ご ひゃく えん');
          if (c.kanji === '五千円') grammarSet.add('ご せん えん');
        }
      });

      // 2. Extraer lecturas canónicas directas de la tarjeta
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

      // 3. Expandir EXCLUSIVAMENTE para estas lecturas directas: Hiragana, Katakana, morfemas y variantes prolongadas
      if (card.displayText) {
        const textMorphemes = getKaldiMorphemePhrases(card.displayText, card.displayReading || '');
        textMorphemes.forEach((m) => grammarSet.add(m));
      }

      directReadings.forEach((r) => {
        const hira = toNormalizedHiragana(r);
        if (hira) {
          grammarSet.add(hira);
          const kata = hira.replace(/[\u3041-\u3096]/g, (ch) =>
            String.fromCharCode(ch.charCodeAt(0) + 0x60)
          );
          if (kata) grammarSet.add(kata);

          // Descomposición de morfemas para Kaldi (ej. 'せん えん', 'がく せい', etc.)
          const morphemes = getKaldiMorphemePhrases(card.displayText || '', hira);
          morphemes.forEach((m) => grammarSet.add(m));

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

    // Añadir '[unk]' para que Kaldi pueda discriminar y rechazar pronunciaciones erróneas (OOV)
    validWords.push('[unk]');

    return validWords;
  }

  getVoskGrammarForCard(card: DueCardWithContext, _lang?: string): string[] {
    return this.buildGrammarForCard(card);
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
