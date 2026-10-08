import { toNormalizedHiragana, normalizeYouon } from './japanese-utils';
import { KANJI_READINGS_MAP } from './kanji-readings-db';
import type { DueCardWithContext } from './srs-engine';

/**
 * Servicio de Diccionario Fonético y Morfológico de Yomi.
 *
 * Resuelve de forma automática y unificada:
 * 1. Mapeo bidireccional Kan/Kanji <-> Kana a partir de la base de datos (words y srs_items)
 *    y del catálogo universal de 2600+ Kanjis (KANJI_READINGS_MAP).
 * 2. Descomposición morfológica estricta para el motor Vosk/Kaldi: detecta automáticamente si
 *    un compuesto es morfológicamente regular (ej. '千円' -> '千 円' / 'せん えん') o si es
 *    una palabra irregular / ateji / jukujikun (ej. '二十' -> 'はたち', '今日' -> 'きょう').
 *    En palabras irregulares, NUNCA inyecta los kanjis separados ('二 十') para evitar que
 *    el usuario apruebe una tarjeta diciendo los kanjis de forma individual.
 * 3. Conversión fonética de transcripciones ASR kanji a kana para validación de voz sin listas manuales.
 * 4. Generación de gramáticas de sesión ricas para Vosk para prevenir colapso acústico y adivinación prematura.
 */

// Índice en memoria de palabras y lecturas de la base de datos
let isInitialized = false;
const wordToReadingsMap = new Map<string, Set<string>>();
const readingToWordsMap = new Map<string, Set<string>>();
const allAppVocabTokens = new Set<string>();

/**
 * Inicializa o actualiza el índice del diccionario con los términos de la base de datos SQLite.
 */
export async function initPhoneticDictionary(): Promise<void> {
  try {
    const { db } = await import('../db');
    const { srsItems, words } = await import('../db/schema');
    if (!db) return;

    // 1. Cargar términos de srs_items
    const srsList = await db
      .select({
        text: srsItems.displayText,
        reading: srsItems.displayReading,
      })
      .from(srsItems);

    for (const item of srsList) {
      registerWordInDictionary(item.text, item.reading);
    }

    // 2. Cargar términos de words
    const wordsList = await db
      .select({
        simplified: words.simplified,
        reading: words.pinyinDisplay,
        aux: words.auxiliaryInfo,
      })
      .from(words);

    for (const w of wordsList) {
      registerWordInDictionary(w.simplified, w.reading);
      if (w.aux) {
        try {
          const parsed = JSON.parse(w.aux);
          if (parsed.kanjiReadings) registerWordInDictionary(w.simplified, parsed.kanjiReadings);
          if (parsed.onReading) registerWordInDictionary(w.simplified, parsed.onReading);
          if (parsed.kunReading) registerWordInDictionary(w.simplified, parsed.kunReading);
        } catch { }
      }
    }

    isInitialized = true;
  } catch (err) {
    console.warn('[PhoneticDictionary] Error al inicializar diccionario desde DB:', err);
  }
}

/**
 * Registra un término y sus lecturas en el índice del diccionario.
 */
export function registerWordInDictionary(rawText?: string, rawReading?: string): void {
  const text = (rawText || '').trim();
  const reading = (rawReading || '').trim();
  if (!text && !reading) return;

  if (text) allAppVocabTokens.add(text);
  if (reading) allAppVocabTokens.add(reading);

  if (text && reading) {
    const readings = reading
      .split(/[\/\n,、;•|]/)
      .map((r) =>
        toNormalizedHiragana(
          r.replace(/^(on|kun|音|訓)[:：\s]*/i, '').replace(/[・~～\s\(\)（）\-\.]/g, '')
        )
      )
      .filter((r) => r.length > 0);

    if (!wordToReadingsMap.has(text)) {
      wordToReadingsMap.set(text, new Set());
    }
    const tSet = wordToReadingsMap.get(text)!;
    readings.forEach((r) => {
      tSet.add(r);
      if (!readingToWordsMap.has(r)) {
        readingToWordsMap.set(r, new Set());
      }
      readingToWordsMap.get(r)!.add(text);
    });
  }
}

/**
 * Obtiene todas las lecturas kana conocidas para un kanji o palabra en la app.
 */
export function getReadingsForWord(wordText: string): string[] {
  const clean = (wordText || '').trim();
  if (!clean) return [];

  const results = new Set<string>();

  // 1. Consultar índice dinámico de la base de datos
  const dbReadings = wordToReadingsMap.get(clean);
  if (dbReadings) {
    dbReadings.forEach((r) => results.add(r));
  }

  // 2. Si es un solo kanji, consultar el catálogo universal de 2600+ kanjis
  if (clean.length === 1 && KANJI_READINGS_MAP[clean]) {
    KANJI_READINGS_MAP[clean].forEach((r) => {
      const hira = toNormalizedHiragana(r);
      if (hira) results.add(hira);
    });
  }

  // 3. Si es un compuesto de kanjis de 2 o más caracteres, generar combinaciones
  // únicamente a partir de sus caracteres constituyentes
  if (/^[\u4e00-\u9faf]{2,}$/.test(clean)) {
    const chars = [...clean];
    if (chars.every((c) => KANJI_READINGS_MAP[c])) {
      let combs = [''];
      for (const c of chars) {
        const readings = KANJI_READINGS_MAP[c].map(toNormalizedHiragana).filter(Boolean);
        const next: string[] = [];
        for (const prefix of combs) {
          for (const r of readings) {
            if (next.length < 50) next.push(prefix + r);
          }
        }
        combs = next;
      }
      combs.forEach((c) => results.add(c));
    }
  }

  return Array.from(results);
}

export interface MorphemeDecomposition {
  /** Indica si la lectura corresponde morfológicamente a la composición regular de sus kanjis */
  isRegular: boolean;
  /** Frase kanji con morfemas separados para Kaldi (ej. '千 円', '学 生') */
  kanjiMorphemes?: string;
  /** Frase kana con morfemas separados para Kaldi (ej. 'せん えん', 'がく せい') */
  kanaMorphemes?: string;
}

/**
 * Analiza un término kanji y su lectura kana para determinar si es una palabra morfológicamente
 * regular según el diccionario universal de kanjis o si es ateji/jukujikun/irregular.
 *
 * Ejemplos:
 * - '千円', 'せんえん' -> isRegular: true, kanjiMorphemes: '千 円', kanaMorphemes: 'せん えん'
 * - '学生', 'がくせい' -> isRegular: true, kanjiMorphemes: '学 生', kanaMorphemes: 'がく せい'
 * - '二十', 'はたち'   -> isRegular: false (ningún kanji de '二'/'十' da 'はたち'. NUNCA genera '二 十')
 * - '今日', 'きょう'   -> isRegular: false (jukujikun irregular)
 */
export function decomposeCompoundForKaldi(
  kanjiText: string,
  kanaReading: string
): MorphemeDecomposition {
  const cleanK = (kanjiText || '').replace(/[^\u4e00-\u9faf]/g, '').trim();
  const cleanR = toNormalizedHiragana(kanaReading || '');

  if (cleanK.length < 2 || !cleanR) {
    return { isRegular: false };
  }

  const chars = [...cleanK];

  // Caso 1: Compuesto de 2 kanjis (ej. 千円, 学生, 日本, 先生, 二十)
  if (chars.length === 2) {
    const c1 = chars[0];
    const c2 = chars[1];
    const r1List = (KANJI_READINGS_MAP[c1] || []).map(toNormalizedHiragana).filter(Boolean);
    const r2List = (KANJI_READINGS_MAP[c2] || []).map(toNormalizedHiragana).filter(Boolean);

    for (const r1 of r1List) {
      if (cleanR.startsWith(r1) && cleanR.length > r1.length) {
        const remainder = cleanR.slice(r1.length);
        for (const r2 of r2List) {
          if (remainder === r2) {
            // Coincidencia exacta confirmada por el diccionario de kanjis
            return {
              isRegular: true,
              kanjiMorphemes: `${c1} ${c2}`,
              kanaMorphemes: `${r1} ${r2}`,
            };
          }
        }
      }
    }

    // Si ninguna lectura de los kanjis individuales forma la lectura esperada,
    // es ateji / jukujikun (como '二十' / 'はたち'). NO es regular.
    return { isRegular: false };
  }

  // Caso 2: Compuesto de 3 kanjis (ej. 日本語, 自動車)
  if (chars.length === 3) {
    const c1 = chars[0];
    const c2 = chars[1];
    const c3 = chars[2];
    const r1List = (KANJI_READINGS_MAP[c1] || []).map(toNormalizedHiragana).filter(Boolean);
    const r2List = (KANJI_READINGS_MAP[c2] || []).map(toNormalizedHiragana).filter(Boolean);
    const r3List = (KANJI_READINGS_MAP[c3] || []).map(toNormalizedHiragana).filter(Boolean);

    for (const r1 of r1List) {
      if (cleanR.startsWith(r1)) {
        const rem1 = cleanR.slice(r1.length);
        for (const r2 of r2List) {
          if (rem1.startsWith(r2)) {
            const rem2 = rem1.slice(r2.length);
            for (const r3 of r3List) {
              if (rem2 === r3) {
                return {
                  isRegular: true,
                  kanjiMorphemes: `${c1} ${c2} ${c3}`,
                  kanaMorphemes: `${r1} ${r2} ${r3}`,
                };
              }
            }
          }
        }
      }
    }
  }

  return { isRegular: false };
}

/**
 * Convierte un texto transcrito por el ASR (que puede venir en Kanji o mixto)
 * a todas sus posibles lecturas fonéticas en kana registradas en la app y diccionario.
 */
export function convertAsrTranscriptToKanaReadings(transcriptText: string): string[] {
  const clean = (transcriptText || '')
    .replace(/[。、！？!?,.:;\s]/g, '')
    .trim()
    .toLowerCase();

  if (!clean) return [];

  const candidates = new Set<string>();

  // 1. Si ya es o contiene Kana / Romaji normalizado
  const directHira = toNormalizedHiragana(clean);
  if (directHira) candidates.add(directHira);

  // 2. Si el texto contiene caracteres Kanji, buscar en el diccionario
  if (/[\u4e00-\u9faf]/.test(clean)) {
    const readings = getReadingsForWord(clean);
    readings.forEach((r) => candidates.add(r));
  }

  return Array.from(candidates);
}

/**
 * Construye la gramática de Vosk para una tarjeta o sesión de forma robusta:
 * - Incluye la lectura fonética de la tarjeta
 * - Si la palabra es regular según el diccionario, descompone en morfemas de Kaldi
 * - Si es irregular (ej. 二十 / はたち), SOLO incluye la lectura legítima de la palabra y NO sus kanjis por separado
 * - Añade un conjunto de palabras contextuales de la sesión / mazo como distractores acústicos
 *   para evitar que Kaldi colapse a la única palabra disponible y adivine con cualquier sonido.
 */
export function buildVoskGrammarForCardWithContext(
  card: DueCardWithContext,
  allSessionCards?: DueCardWithContext[]
): string[] {
  const grammarSet = new Set<string>();

  // 1. Extraer lectura esperada de la tarjeta
  const expectedReadings: string[] = [];
  if (card.displayReading) {
    card.displayReading.split(/[\/\n,、;•|]/).forEach((p) => {
      const clean = toNormalizedHiragana(
        p.replace(/^(on|kun|音|訓)[:：\s]*/i, '').replace(/[・~～\s\(\)（）\-\.]/g, '').trim()
      );
      if (clean) expectedReadings.push(clean);
    });
  }

  if (card.auxiliaryInfo) {
    try {
      const aux = JSON.parse(card.auxiliaryInfo);
      if (aux.kanjiReadings) {
        aux.kanjiReadings.split(/[\/\n,、;•|]/).forEach((p: string) => {
          const clean = toNormalizedHiragana(
            p.replace(/^(on|kun|音|訓)[:：\s]*/i, '').replace(/[・~～\s\(\)（）\-\.]/g, '').trim()
          );
          if (clean) expectedReadings.push(clean);
        });
      }
      if (aux.onReading) {
        aux.onReading.split(/[,、\s]+/).forEach((p: string) => {
          const clean = toNormalizedHiragana(p.replace(/[・~～\s\(\)（）\-\.]/g, '').trim());
          if (clean) expectedReadings.push(clean);
        });
      }
      if (aux.kunReading) {
        aux.kunReading.split(/[,、\s]+/).forEach((p: string) => {
          const clean = toNormalizedHiragana(p.replace(/[・~～\s\(\)（）\-\.]/g, '').trim());
          if (clean) expectedReadings.push(clean);
        });
      }
    } catch { }
  }

  const displayText = (card.displayText || '').trim();

  // Si es un kanji individual sin lectura explícita, incorporar sus lecturas de KANJI_READINGS_MAP
  if (expectedReadings.length === 0 && displayText.length === 1 && KANJI_READINGS_MAP[displayText]) {
    KANJI_READINGS_MAP[displayText].forEach((r) => {
      const hira = toNormalizedHiragana(r);
      if (hira) expectedReadings.push(hira);
    });
  }

  // 2. Incorporar las lecturas legítimas de la tarjeta actual en Kana y Katakana
  expectedReadings.forEach((r) => {
    grammarSet.add(r);
    const kata = r.replace(/[\u3041-\u3096]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60)
    );
    if (kata) grammarSet.add(kata);

    // Descomposición morfológica basada en diccionario:
    // SOLO si el término kanji es regular se agregan los morfemas de Kaldi
    if (displayText) {
      const decomp = decomposeCompoundForKaldi(displayText, r);
      if (decomp.isRegular) {
        if (decomp.kanjiMorphemes) grammarSet.add(decomp.kanjiMorphemes);
        if (decomp.kanaMorphemes) grammarSet.add(decomp.kanaMorphemes);
        grammarSet.add(displayText);
      }
    }
  });

  // Si es una sola palabra o kanji directo, añadir displayText
  if (displayText && !grammarSet.has(displayText)) {
    // Si NO es compuesto irregular con lectura diferente
    const isIrregular = expectedReadings.some(
      (r) => !decomposeCompoundForKaldi(displayText, r).isRegular && displayText.length >= 2
    );
    if (!isIrregular) {
      grammarSet.add(displayText);
    }
  }

  // 3. Vocabulario contextual de discriminación acústica:
  // Añadir palabras de las demás tarjetas de la sesión para que Kaldi tenga un espacio
  // de hipótesis realista y NO colapse acústicamente con el primer ruido hacia la única palabra.
  if (allSessionCards && allSessionCards.length > 0) {
    const distractors = allSessionCards
      .filter((c) => c.displayText !== card.displayText)
      .slice(0, 30); // Limitar a un conjunto manejable de 30 palabras

    distractors.forEach((d) => {
      if (d.displayReading) {
        const dHira = toNormalizedHiragana(d.displayReading.split(/[\/\n,、;•|]/)[0]);
        if (dHira) {
          grammarSet.add(dHira);
          const dKata = dHira.replace(/[\u3041-\u3096]/g, (ch) =>
            String.fromCharCode(ch.charCodeAt(0) + 0x60)
          );
          if (dKata) grammarSet.add(dKata);
        }
      }
      if (d.displayText && d.displayText.length <= 4) {
        grammarSet.add(d.displayText);
      }
    });
  }

  // Filtrar tokens vacíos o no válidos
  const validWords = Array.from(grammarSet)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && w !== '[unk]');

  // Añadir '[unk]' obligatorio para que Kaldi descarte ruido y silencio
  validWords.push('[unk]');

  return validWords;
}
