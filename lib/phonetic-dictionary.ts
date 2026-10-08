import { toNormalizedHiragana, normalizeYouon, normalizeJapaneseCalendarText, DAY_DATA } from './japanese-utils';
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
 * Segmenta expresiones que contienen partículas gramaticales como 'の'.
 * Ejemplo:
 * - displayText: '男の人', displayReading: 'おとこのひと' -> { kanjiMorphemes: '男 の 人', kanaMorphemes: 'おとこ の ひと' }
 * - displayText: '女の人', displayReading: 'おんなのひと' -> { kanjiMorphemes: '女 の 人', kanaMorphemes: 'おんな の ひと' }
 */
export function segmentParticlePhrase(
  kanjiText: string,
  kanaReading: string
): { kanjiMorphemes?: string; kanaMorphemes?: string } | null {
  const cleanK = (kanjiText || '').trim();
  const cleanR = toNormalizedHiragana(kanaReading || '');
  if (!cleanK || !cleanR) return null;

  const particles = ['の', 'から', 'まで', 'より', 'と', 'に', 'で', 'を', 'が', 'は', 'へ', 'な', 'や'];
  for (const p of particles) {
    if (cleanK.includes(p) && cleanR.includes(p)) {
      const kParts = cleanK.split(p);
      const rParts = cleanR.split(p);
      if (kParts.length === rParts.length && kParts.length >= 2) {
        if (kParts.every((x) => x.trim().length > 0) && rParts.every((x) => x.trim().length > 0)) {
          return {
            kanjiMorphemes: kParts.map((x) => x.trim()).join(` ${p} `),
            kanaMorphemes: rParts.map((x) => x.trim()).join(` ${p} `),
          };
        }
      }
    }
  }

  return null;
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

  // Si es un día del calendario con lectura irregular (ej. 六日 / むいか), NO segmentar en kanjis sueltos
  const rawK = (kanjiText || '').trim();
  if (rawK.endsWith('日') && (cleanR.endsWith('か') || cleanR === 'ついたち')) {
    return { isRegular: false };
  }

  const chars = [...cleanK];

  // Caso 1: Compuesto de 2 kanjis (ej. 千円, 学生, 日本, 先生)
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
            return {
              isRegular: true,
              kanjiMorphemes: `${c1} ${c2}`,
              kanaMorphemes: `${r1} ${r2}`,
            };
          }
        }
      }
    }
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
 * Convierte un texto transcrito por el ASR a todas sus posibles lecturas fonéticas en kana.
 * IMPORTANTE: NUNCA mapea kanjis de días especiales (como '六日') a su lectura kana ('むいか')
 * porque eso permitiría que pronunciar erróneamente 'ろくにち' (que el ASR transcribe como '六日')
 * se evalúe fraudulentamente como 'むいか'.
 */
export function convertAsrTranscriptToKanaReadings(transcriptText: string): string[] {
  const clean = (transcriptText || '')
    .replace(/[。、！？!?,.:;\s]/g, '')
    .trim()
    .toLowerCase();

  if (!clean) return [];

  const candidates = new Set<string>();

  // 1. Directo normalizado a hiragana
  const directHira = toNormalizedHiragana(clean);
  if (directHira) candidates.add(directHira);

  // 2. Consultar lecturas canónicas registradas en la DB (solo para palabras regulares de vocabulario)
  const dbReadings = wordToReadingsMap.get(clean);
  if (dbReadings) {
    dbReadings.forEach((r) => candidates.add(r));
  }

  // 3. Si es un único kanji aislado
  if (clean.length === 1 && KANJI_READINGS_MAP[clean]) {
    KANJI_READINGS_MAP[clean].forEach((r) => {
      const hira = toNormalizedHiragana(r);
      if (hira) candidates.add(hira);
    });
  }

  return Array.from(candidates);
}

/**
 * Construye la gramática cerrada de Vosk EXCLUSIVA para la tarjeta actual.
 * Aplica segmentación morfológica por espacios obligatoria para Kaldi:
 * - Días irregulares de calendario (ej. 6日 / 六日 -> SOLO 'むい か', NUNCA '六 日')
 * - Expresiones con partícula (ej. 男の人 -> 'おとこ の ひと', '男 の 人')
 * - Compuestos regulares (ej. 千円 -> '千 円', 'せん えん')
 * - Compuestos irregulares (ej. 二十 -> 'はたち')
 * - Filtro de [unk]
 *
 * PROHIBIDO inyectar palabras de otras tarjetas de la sesión: genera combinaciones acústicas
 * erróneas (ej. 'dannoshi' para '男の人'). La gramática debe ser 100% aislada por tarjeta.
 */
export function buildVoskGrammarForCardWithContext(
  card: DueCardWithContext,
  _allSessionCards?: DueCardWithContext[]
): string[] {
  const grammarSet = new Set<string>();
  const displayText = (card.displayText || '').trim();
  const displayReading = toNormalizedHiragana(card.displayReading || '');

  // 1. Días del calendario (1日〜31日 o 一日〜三十一日):
  for (const d of DAY_DATA) {
    if (displayText === d.altKanji || displayText === d.kanji) {
      grammarSet.add(d.morpheme);
      if (d.kana !== d.morpheme && ['ついたち', 'ふつか', 'いつか', 'なのか', 'ようか', 'はつか'].includes(d.kana)) {
        grammarSet.add(d.kana);
      }
      grammarSet.add('[unk]');
      return Array.from(grammarSet);
    }
  }

  // 2. Expresiones con partícula (ej. 男の人 -> 'おとこ の ひと', '男 の 人')
  const particleSeg = segmentParticlePhrase(displayText, displayReading);
  if (particleSeg) {
    if (particleSeg.kanaMorphemes) {
      grammarSet.add(particleSeg.kanaMorphemes);
    }
    if (particleSeg.kanjiMorphemes) {
      grammarSet.add(particleSeg.kanjiMorphemes);
    }
  }

  // 3. Compuestos kanji regulares (ej. 千円 -> '千 円', 'せん えん')
  let isRegularCompound = false;
  if (displayText && displayReading) {
    const decomp = decomposeCompoundForKaldi(displayText, displayReading);
    if (decomp.isRegular) {
      isRegularCompound = true;
      if (decomp.kanaMorphemes) {
        grammarSet.add(decomp.kanaMorphemes);
      }
      if (decomp.kanjiMorphemes) {
        grammarSet.add(decomp.kanjiMorphemes);
      }
    }
  }

  // 4. Lecturas canónicas directas de la tarjeta:
  // Si la palabra ya fue descompuesta en morfemas separados por espacios (partículas o compuestos regulares como '男の人' o '千円'),
  // NO inyectar la lectura unida 'おとこのひと' o 'せんえん' porque no existen en words.txt de Kaldi.
  // Solo inyectar la lectura directa si NO es una frase con partículas ni compuesto regular descompuesto.
  if (!particleSeg && !isRegularCompound) {
    const expectedReadings: string[] = [];
    if (card.displayReading) {
      card.displayReading.split(/[\/\n,、;•|]/).forEach((p) => {
        const clean = toNormalizedHiragana(
          p.replace(/^(on|kun|音|訓)[:：\s]*/i, '').replace(/[・~～\s\(\)（）\-\.]/g, '').trim()
        );
        if (clean) expectedReadings.push(clean);
      });
    }

    expectedReadings.forEach((r) => {
      grammarSet.add(r);

      // Terminaciones verbales / adjetivales frecuentes separadas para Kaldi
      if (r.length >= 3) {
        if (r.endsWith('ます')) grammarSet.add(`${r.slice(0, -2)} ます`);
        else if (r.endsWith('ました')) grammarSet.add(`${r.slice(0, -3)} ました`);
        else if (r.endsWith('ません')) grammarSet.add(`${r.slice(0, -3)} ません`);
        else if (r.endsWith('ない')) grammarSet.add(`${r.slice(0, -2)} ない`);
        else if (r.endsWith('た')) grammarSet.add(`${r.slice(0, -1)} た`);
        else if (r.endsWith('て')) grammarSet.add(`${r.slice(0, -1)} て`);
        else if (r.endsWith('です')) grammarSet.add(`${r.slice(0, -2)} です`);
        else if (r.endsWith('でした')) grammarSet.add(`${r.slice(0, -3)} でした`);
      }

      // Monosílabos: variantes de duración natural
      if (r.length <= 2) {
        const prolongations = [r + 'ー'];
        prolongations.forEach((p) => grammarSet.add(p));
      }
    });

    // 5. Añadir displayText si es una palabra única / no descompuesta sin partículas
    if (
      displayText &&
      displayText.length <= 5 &&
      !displayText.includes('日') &&
      !grammarSet.has(displayText)
    ) {
      const isIrregular = expectedReadings.some(
        (r) => !decomposeCompoundForKaldi(displayText, r).isRegular && displayText.length >= 2
      );
      if (!isIrregular) {
        grammarSet.add(displayText);

        if (displayText.length >= 3) {
          if (displayText.endsWith('ます')) grammarSet.add(`${displayText.slice(0, -2)} ます`);
          else if (displayText.endsWith('ました')) grammarSet.add(`${displayText.slice(0, -3)} ました`);
          else if (displayText.endsWith('ません')) grammarSet.add(`${displayText.slice(0, -3)} ません`);
          else if (displayText.endsWith('ない')) grammarSet.add(`${displayText.slice(0, -2)} ない`);
          else if (displayText.endsWith('た')) grammarSet.add(`${displayText.slice(0, -1)} た`);
          else if (displayText.endsWith('て')) grammarSet.add(`${displayText.slice(0, -1)} て`);
          else if (displayText.endsWith('です')) grammarSet.add(`${displayText.slice(0, -2)} です`);
          else if (displayText.endsWith('でした')) grammarSet.add(`${displayText.slice(0, -3)} でした`);
        }
      }
    }

    // 6. Si la tarjeta es un único kanji aislado sin lectura registrada, consultar diccionario universal
    if (expectedReadings.length === 0 && displayText.length === 1 && KANJI_READINGS_MAP[displayText]) {
      KANJI_READINGS_MAP[displayText].forEach((r) => {
        const clean = toNormalizedHiragana(r.replace(/[・~～\s\(\)（）\-\.]/g, '').trim());
        if (clean) grammarSet.add(clean);
      });
    }
  }

  // 7. Si la palabra original es un préstamo en Katakana (ej. コーヒー, パン, アメリカ), incluir Katakana
  if (/^[\u30a0-\u30ff\sー]+$/.test(displayText)) {
    grammarSet.add(displayText);
  }

  // Filtrar tokens vacíos o duplicados
  const validWords = Array.from(grammarSet)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && w !== '[unk]');

  validWords.push('[unk]');
  return validWords;
}
