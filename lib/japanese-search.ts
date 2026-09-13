import { romajiToHiragana, containsJapanese, deconjugateJapanese, classifyJapaneseWord, conjugateJapanese, JapaneseConjugationForm, toNormalizedHiragana } from './japanese-utils';
import { getQuickJlptLevel } from './jlpt-data';

export interface JapaneseEntry {
  id: string;
  kanji: string;
  reading: string;
  romaji: string;
  meanings: string[];
  isCommon: boolean;
  level?: string; // 'N5', 'N4', 'N3', 'N2', 'N1'
  category?: string; // 'Verbo Godan (Grupo 1)', 'Verbo Ichidan (Grupo 2)', 'Verbo Irregular (Grupo 3)', 'Adjetivo -i', 'Adjetivo -na', 'Sustantivo', 'Frase / Expresión'
  dictionaryForm?: {
    kanji: string;
    reading: string;
    meanings?: string[];
  };
  detectedConjugation?: string;
}

export interface FuriganaPair {
  char: string;
  furigana?: string;
}

export function extractKanjis(str: string): string[] {
  if (!str) return [];
  const isKanji = (ch: string) => /[\u4e00-\u9faf]/.test(ch);
  const seen = new Set<string>();
  const list: string[] = [];
  for (const ch of str.split('')) {
    if (isKanji(ch) && !seen.has(ch)) {
      seen.add(ch);
      list.push(ch);
    }
  }
  return list;
}

/**
 * Genera pares de Kanji y Furigana (etiqueta Ruby) asociando la pronunciación Kana EXCLUSIVAMENTE a los caracteres Kanji.
 */
export function parseFurigana(kanji: string, reading: string): FuriganaPair[] {
  if (!kanji) return [];
  if (!reading || kanji === reading) {
    return kanji.split('').map(char => ({ char }));
  }

  const isKanji = (ch: string) => /[\u4e00-\u9faf]/.test(ch);

  // Si la palabra no contiene ningun Kanji, se devuelve limpia sin Furigana
  if (!kanji.split('').some(isKanji)) {
    return kanji.split('').map(char => ({ char }));
  }

  let kStart = 0;
  let rStart = 0;

  // 1. Recortar prefijo de Kana coincidente (ej. よろしくお en よろしくお願いいたします)
  while (
    kStart < kanji.length &&
    rStart < reading.length &&
    !isKanji(kanji[kStart]) &&
    kanji[kStart] === reading[rStart]
  ) {
    kStart++;
    rStart++;
  }

  // 2. Recortar sufijo de Kana coincidente (ej. いします en よろしくお願いいたします)
  let kEnd = kanji.length - 1;
  let rEnd = reading.length - 1;
  while (
    kEnd >= kStart &&
    rEnd >= rStart &&
    !isKanji(kanji[kEnd]) &&
    kanji[kEnd] === reading[rEnd]
  ) {
    kEnd--;
    rEnd--;
  }

  const prefixPairs: FuriganaPair[] = kanji.slice(0, kStart).split('').map(char => ({ char }));
  const suffixPairs: FuriganaPair[] = kanji.slice(kEnd + 1).split('').map(char => ({ char }));

  const kanjiStem = kanji.slice(kStart, kEnd + 1);
  const readingStem = reading.slice(rStart, rEnd + 1);

  const stemChars = kanjiStem.split('');
  const kanjiInStem = stemChars.filter(isKanji);

  const stemPairs: FuriganaPair[] = [];

  if (kanjiInStem.length === 0) {
    for (const char of stemChars) {
      stemPairs.push({ char });
    }
  } else if (kanjiInStem.length === 1) {
    for (const char of stemChars) {
      if (isKanji(char)) {
        stemPairs.push({ char, furigana: readingStem });
      } else {
        stemPairs.push({ char });
      }
    }
  } else {
    // Varios Kanjis en la raíz (ej. 日本語 -> にほんご)
    const approxChunkLen = Math.floor(readingStem.length / kanjiInStem.length);
    let rPos = 0;
    let kanjiSeen = 0;

    for (let i = 0; i < stemChars.length; i++) {
      const char = stemChars[i];
      if (isKanji(char)) {
        kanjiSeen++;
        const isLastKanji = kanjiSeen === kanjiInStem.length;
        const chunk = isLastKanji
          ? readingStem.slice(rPos)
          : readingStem.slice(rPos, rPos + (approxChunkLen || 1));
        stemPairs.push({ char, furigana: chunk });
        rPos += chunk.length;
      } else {
        stemPairs.push({ char });
      }
    }
  }

  return [...prefixPairs, ...stemPairs, ...suffixPairs];
}

/**
 * Capitaliza la primera letra de un texto.
 */
export function capitalizeFirst(str: string): string {
  if (!str) return str;
  const trimmed = str.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Divide un texto de significados separando por comas o puntos y coma
 * ÚNICAMENTE si no están dentro de paréntesis (...) o corchetes [...].
 * Esto previene romper aclaraciones como "(de una persona, animal)" en fragmentos separados.
 */
export function splitMeaningsSafely(text: string): string[] {
  if (!text) return [];
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '(' || char === '（') parenDepth++;
    else if (char === ')' || char === '）') parenDepth = Math.max(0, parenDepth - 1);
    else if (char === '[' || char === '【') bracketDepth++;
    else if (char === ']' || char === '】') bracketDepth = Math.max(0, bracketDepth - 1);

    const isNumberSeparator =
      (char === ',' || char === '.') &&
      i > 0 &&
      i < text.length - 1 &&
      /\d/.test(text[i - 1]) &&
      /\d/.test(text[i + 1]);

    if (
      !isNumberSeparator &&
      (char === ',' || char === ';' || char === '、' || char === '；') &&
      parenDepth === 0 &&
      bracketDepth === 0
    ) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = '';
    } else {
      current += char;
    }
  }

  const lastTrimmed = current.trim();
  if (lastTrimmed) parts.push(lastTrimmed);

  return parts;
}

/**
 * Limpia, desduplica y capitaliza cada significado individual de un array o string,
 * preservando íntegras las aclaraciones entre paréntesis.
 */
export function cleanAndFormatMeanings(meanings: string[] | string): string[] {
  if (!meanings) return [];
  
  let rawList: string[] = [];
  if (Array.isArray(meanings)) {
    rawList = meanings;
  } else {
    try {
      rawList = JSON.parse(meanings);
      if (!Array.isArray(rawList)) rawList = [String(meanings)];
    } catch {
      rawList = [String(meanings)];
    }
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of rawList) {
    if (!item) continue;
    let cleanedStr = String(item).trim();
    if (!cleanedStr) continue;

    // Separar palabras compuestas concatenadas sin espacio tras traducción automática
    cleanedStr = cleanedStr
      .replace(/buquehospital/gi, 'buque hospital')
      .replace(/hospitalgeneral/gi, 'hospital general')
      .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2');

    // Usar división segura que respeta paréntesis
    const parts = splitMeaningsSafely(cleanedStr);
    for (const part of parts) {
      let trimmed = part.trim();
      if (!trimmed) continue;
      
      // Quitar puntos finales innecesarios en significados de diccionario
      trimmed = trimmed.replace(/\.+$/, '').trim();
      if (!trimmed) continue;

      const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      const key = capitalized.toLowerCase();
      
      if (!seen.has(key)) {
        seen.add(key);
        result.push(capitalized);
      }
    }
  }

  return result;
}

const translationCache = new Map<string, string>();

/**
 * Traduce un conjunto de textos al español en 1 sola solicitud HTTP por lotes,
 * utilizando caché en memoria para evitar llamadas redundantes y prevenir rate limits (HTTP 429).
 */
export async function translateBatchToSpanish(texts: string[], fromLang: 'en' | 'ja' = 'en'): Promise<string[]> {
  if (!texts || texts.length === 0) return [];

  const results: string[] = new Array(texts.length);
  const pendingIndices: number[] = [];
  const pendingTexts: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    const raw = texts[i]?.trim();
    if (!raw) {
      results[i] = '';
      continue;
    }
    const cacheKey = `${fromLang}::${raw.toLowerCase()}`;
    if (translationCache.has(cacheKey)) {
      results[i] = translationCache.get(cacheKey)!;
    } else {
      pendingIndices.push(i);
      pendingTexts.push(raw);
    }
  }

  if (pendingTexts.length === 0) {
    return results;
  }

  // Dividir en grupos de hasta 15 frases por llamada para máxima estabilidad y evitar rate limits
  const CHUNK_SIZE = 15;
  for (let c = 0; c < pendingTexts.length; c += CHUNK_SIZE) {
    const chunkTexts = pendingTexts.slice(c, c + CHUNK_SIZE);
    const chunkIndices = pendingIndices.slice(c, c + CHUNK_SIZE);
    const joinedQuery = chunkTexts.join(' \n\n ');

    try {
      const res = await fetch(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=es&dt=t&q=${encodeURIComponent(joinedQuery)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data && data[0] && Array.isArray(data[0])) {
          const fullTranslated = data[0].map((item: any) => item[0] || '').join('');
          const parts = fullTranslated.split(/\n\s*\n/);
          for (let j = 0; j < chunkIndices.length; j++) {
            const originalIndex = chunkIndices[j];
            const originalText = chunkTexts[j];
            const translatedPart = (parts[j] || '').trim() || originalText;
            const capitalized = capitalizeFirst(translatedPart);
            translationCache.set(`${fromLang}::${originalText.toLowerCase()}`, capitalized);
            results[originalIndex] = capitalized;
          }
          continue;
        }
      }
    } catch (err) {
      console.warn('Error en traducción por lotes:', err);
    }

    // Fallback individual si el lote falló
    for (let j = 0; j < chunkIndices.length; j++) {
      const originalIndex = chunkIndices[j];
      const originalText = chunkTexts[j];
      try {
        const singleRes = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=es&dt=t&q=${encodeURIComponent(originalText)}`
        );
        if (singleRes.ok) {
          const singleData = await singleRes.json();
          if (singleData && singleData[0] && singleData[0][0] && singleData[0][0][0]) {
            const translated = capitalizeFirst(singleData[0][0][0].trim());
            translationCache.set(`${fromLang}::${originalText.toLowerCase()}`, translated);
            results[originalIndex] = translated;
            continue;
          }
        }
      } catch { }
      results[originalIndex] = capitalizeFirst(originalText);
    }
  }

  return results;
}

/**
 * Traduce un texto al español (desde inglés por defecto o japonés si se especifica).
 */
export async function translateToSpanish(text: string, fromLang: 'en' | 'ja' = 'en'): Promise<string> {
  if (!text) return text;
  const [translated] = await translateBatchToSpanish([text], fromLang);
  return translated || capitalizeFirst(text);
}

/**
 * Mapea las partes de la oración (parts_of_speech) devueltas por JMdict/Jisho
 * a categorías estandarizadas y simplificadas (Verbo Godan (-u), Verbo Ichidan (-ru), etc.)
 */
export function mapJishoPartsOfSpeech(partsOfSpeech: string[], word: string, reading: string): string {
  if (!partsOfSpeech || partsOfSpeech.length === 0) {
    return classifyJapaneseWord(word, reading);
  }

  const joined = partsOfSpeech.join(' ').toLowerCase();

  if (joined.includes('suru verb') || joined.includes('kuru verb')) {
    return 'Verbo Irregular';
  }
  if (joined.includes('ichidan verb')) {
    return 'Verbo Ichidan (-ru)';
  }
  if (joined.includes('godan verb')) {
    if (reading.endsWith('る') || word.endsWith('る')) {
      return 'Verbo Godan (-ru)';
    }
    return 'Verbo Godan (-u)';
  }
  if (joined.includes('i-adjective') || joined.includes('keiyoushi')) {
    return 'Adjetivo -i';
  }
  if (joined.includes('na-adjective') || joined.includes('keiyoudoushi')) {
    return 'Adjetivo -na';
  }
  if (joined.includes('noun')) {
    return 'Sustantivo';
  }
  if (joined.includes('expression') || joined.includes('phrase')) {
    return 'Frase / Expresión';
  }

  return classifyJapaneseWord(word, reading);
}

/**
 * Busca palabras en japonés (usando JMdict/Jisho) con ordenamiento inteligente por relevancia y uso común.
 */
export async function searchJapanese(rawInput: string): Promise<JapaneseEntry[]> {
  if (!rawInput || !rawInput.trim()) return [];

  const input = rawInput.trim();
  const hiragana = containsJapanese(input) ? input : romajiToHiragana(input);

  // Detectar si el usuario ingresó una frase u oración compuesta (con espacios o longitud de oración)
  const isMultiWordPhrase = input.includes(' ') || hiragana.length >= 7;

  // Obtener formas de diccionario posibles (ej: "tabete" -> ["たべて", "たべる"])
  const searchTerms = deconjugateJapanese(input);

  // Consultar en Jisho EXCLUSIVAMENTE en Kana/Kanji japonés
  const queryTerms = Array.from(new Set([
    hiragana,
    ...searchTerms.map((t) => (containsJapanese(t) ? t : romajiToHiragana(t)))
  ])).filter(Boolean);

  try {
    // Si es una frase u oración, traducir inmediatamente la frase completa para asegurar que sea la tarjeta principal
    let phraseEntry: JapaneseEntry | null = null;
    if (isMultiWordPhrase) {
      const phraseTranslation = await translateToSpanish(hiragana || input, 'ja');
      phraseEntry = {
        id: `ja_phrase_${Date.now()}`,
        kanji: hiragana || input,
        reading: hiragana,
        romaji: input.toLowerCase(),
        meanings: [phraseTranslation || 'Frase / Oración'],
        isCommon: true,
        category: 'Frase / Expresión',
      };
    }

    // Consultar primero palabras comunes (#common) para que los términos cotidianos aparezcan primero
    const queryPromises = queryTerms.flatMap((term) => [
      fetch(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(term + ' #common')}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => (Array.isArray(json?.data) ? json.data : []))
        .catch(() => []),
      fetch(`https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(term)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => (Array.isArray(json?.data) ? json.data : []))
        .catch(() => []),
    ]);

    const resultsArray = await Promise.all(queryPromises);
    const combinedData: any[] = [];
    const seenSlugs = new Set<string>();

    for (const dataList of resultsArray) {
      for (const item of dataList) {
        const japaneseObj = item.japanese && item.japanese[0] ? item.japanese[0] : {};
        const word = (japaneseObj.word || '').trim();
        const reading = (japaneseObj.reading || '').trim();
        const cleanWord = word.toLowerCase();
        const cleanReading = reading.toLowerCase();

        // FILTRADO ESTRICTO:
        // Descartar coincidencias espurias de 1 solo carácter si la búsqueda tenía 2 o más caracteres
        const isSingleCharResult = (cleanReading.length <= 1 && cleanWord.length <= 1);
        const hasMultiCharQuery = queryTerms.some((qt) => qt.length >= 2);
        if (isSingleCharResult && hasMultiCharQuery) {
          continue;
        }

        // Descartar entradas que no tengan coincidencia directa o prefija con la búsqueda
        const matchesQuery = queryTerms.some((qt) => {
          const lowerQt = qt.toLowerCase();
          if (cleanWord === lowerQt || cleanReading === lowerQt) return true;
          if (cleanWord.startsWith(lowerQt) || cleanReading.startsWith(lowerQt)) return true;
          if (lowerQt.includes(cleanReading) && cleanReading.length >= 2) return true;
          if (lowerQt.includes(cleanWord) && cleanWord.length >= 2) return true;
          return cleanWord.includes(lowerQt) || cleanReading.includes(lowerQt);
        });

        if (!matchesQuery) continue;

        const slug = item.slug || `${word}_${reading}`;
        if (!seenSlugs.has(slug)) {
          seenSlugs.add(slug);
          combinedData.push(item);
        }
      }
    }

    if (combinedData.length === 0) {
      // Si el diccionario no tiene la entrada directa (ej. una oración o frase larga como "chotto matte kudasai"),
      // traducirla automáticamente del japonés al español para que el usuario pueda guardarla directamente
      const translated = await translateToSpanish(hiragana || input, 'ja');
      return [
        {
          id: `ja_phrase_${Date.now()}`,
          kanji: hiragana || input,
          reading: hiragana,
          romaji: input.toLowerCase(),
          meanings: [translated || 'Frase / Oración'],
          isCommon: true,
          category: 'Frase / Expresión',
        }
      ];
    }

    // Formas exactas esperadas (incluyendo la forma de diccionario derivada, ej. "たべる", "食べる")
    const matchTargets = new Set<string>(
      queryTerms.map((t) => t.toLowerCase())
    );

    // Identificar si existen coincidencias exactas con el término buscado o su forma de diccionario
    const isExactMatchItem = (item: any) => {
      const jObj = item.japanese && item.japanese[0] ? item.japanese[0] : {};
      const w = (jObj.word || '').toLowerCase();
      const r = (jObj.reading || '').toLowerCase();
      return matchTargets.has(w) || matchTargets.has(r);
    };

    const exactMatches = combinedData.filter(isExactMatchItem);

    // OPTIMIZACIÓN: Si existe al menos una coincidencia exacta (ej. "tabete" -> 食べる o "kesu" -> 消す),
    // descartar compuestos largos (como tabesugiru) y procesar/traducir ÚNICAMENTE las palabras exactas.
    const filteredData = exactMatches.length > 0 ? exactMatches : combinedData;

    // Scoring y ordenamiento determinista por popularidad y relevancia:
    const getScore = (item: any): number => {
      const jObj = item.japanese && item.japanese[0] ? item.japanese[0] : {};
      const w = (jObj.word || '').toLowerCase();
      const r = (jObj.reading || '').toLowerCase();

      let score = 0;
      const isExact = matchTargets.has(w) || matchTargets.has(r);
      const isPrefix = Array.from(matchTargets).some((mt) => w.startsWith(mt) || r.startsWith(mt));

      if (isExact) score += 200;
      else if (isPrefix) score += 50;

      // Prioridad máxima a palabras de uso común popular
      if (item.is_common === true) score += 100;

      // Puntos extra por nivel JLPT (vocabulario estudiado y popular)
      const jlptStr = (Array.isArray(item.jlpt) && item.jlpt.length > 0) ? item.jlpt[0].toLowerCase() : '';
      const quickJlpt = getQuickJlptLevel(jObj.word || '') || getQuickJlptLevel(jObj.reading || '');
      const effectiveJlpt = quickJlpt ? quickJlpt.toLowerCase() : jlptStr;

      if (effectiveJlpt.includes('n5')) score += 50;
      else if (effectiveJlpt.includes('n4')) score += 40;
      else if (effectiveJlpt.includes('n3')) score += 30;
      else if (effectiveJlpt.includes('n2')) score += 20;
      else if (effectiveJlpt.includes('n1')) score += 10;

      // Penalización por longitud extra (prefiere palabras más directas)
      const len = (jObj.word || jObj.reading || '').length;
      score -= len * 2;

      return score;
    };

    const sortedData = filteredData.sort((a, b) => getScore(b) - getScore(a));

    // Si hay coincidencias exactas, limitar a máximo 3 (variantes Kanji de la misma palabra),
    // si no hay exacta, hasta 4 resultados para sugerencias mientras el usuario escribe.
    const topResults = sortedData.slice(0, exactMatches.length > 0 ? 3 : 4);
    const preparedItems: Array<{
      item: any;
      dictionaryWord: string;
      dictionaryReading: string;
      jlptLevel?: string;
      category: string;
      displayKanji: string;
      displayReading: string;
      conjugationNote: string;
      rawDefinitions: string[];
    }> = [];

    const allDefinitionsToTranslate: string[] = [];

    for (let i = 0; i < topResults.length; i++) {
      const item = topResults[i];
      const japaneseObj = item.japanese && item.japanese[0] ? item.japanese[0] : {};
      
      const dictionaryWord = japaneseObj.word || japaneseObj.reading || input;
      const dictionaryReading = japaneseObj.reading || japaneseObj.word || hiragana;

      // Extraer nivel JLPT (priorizando diccionario de expresiones cotidianas N5/N4)
      let jlptLevel: string | undefined = getQuickJlptLevel(dictionaryWord) || getQuickJlptLevel(dictionaryReading);
      if (!jlptLevel && item.jlpt && Array.isArray(item.jlpt) && item.jlpt.length > 0) {
        const match = item.jlpt[0].match(/n([1-5])/i);
        if (match) {
          jlptLevel = `N${match[1]}`;
        }
      }

      // Extraer definiciones en inglés refinadas y partes de la oración
      const rawEnglishDefinitions: string[] = [];
      const partsOfSpeechList: string[] = [];

      if (item.senses && item.senses.length > 0) {
        for (const sense of item.senses) {
          if (Array.isArray(sense.parts_of_speech)) {
            partsOfSpeechList.push(...sense.parts_of_speech);
          }
        }

        // Filtrar sentidos poco usados, arcaicos u obsoletos
        const cleanSenses = item.senses.filter((sense: any) => {
          const tags = (sense.tags || []).map((t: string) => String(t).toLowerCase());
          return !tags.some((t: string) =>
            t.includes('archaic') || t.includes('obsolete') || t.includes('rare') || t.includes('vulgar') || t.includes('historical')
          );
        });

        const validSenses = cleanSenses.length > 0 ? cleanSenses : item.senses;

        // Extraer definiciones representativas de las acepciones principales (hasta 3 acepciones)
        for (let sIdx = 0; sIdx < Math.min(validSenses.length, 3); sIdx++) {
          const sense = validSenses[sIdx];
          if (sense && Array.isArray(sense.english_definitions)) {
            // De la acepción 1 tomamos hasta 2 definiciones; de las siguientes tomamos la principal
            const countToTake = sIdx === 0 ? 2 : 1;
            const defs = sense.english_definitions.slice(0, countToTake);
            for (const def of defs) {
              if (def && typeof def === 'string') {
                const trimmed = def.trim();
                if (trimmed && !rawEnglishDefinitions.includes(trimmed)) {
                  rawEnglishDefinitions.push(trimmed);
                }
              }
            }
          }
        }
      }

      // Clasificación estandarizada de categoría gramatical
      const category = mapJishoPartsOfSpeech(partsOfSpeechList, dictionaryWord, dictionaryReading);

      // Si el usuario buscó una forma conjugada específica (ej. "nomimasu" / "のみます" / "飲みます"),
      // adaptamos el título de la tarjeta para que muestre exactamente lo que buscó el usuario en su forma conjugada
      let displayKanji = dictionaryWord;
      let displayReading = dictionaryReading;
      let conjugationNote = '';

      if (
        (input.toLowerCase() !== dictionaryWord.toLowerCase() && input.toLowerCase() !== dictionaryReading.toLowerCase()) &&
        (hiragana !== dictionaryWord && hiragana !== dictionaryReading)
      ) {
        // 1. Forma progresiva / estado: -te imasu / -te iru
        const teConj = conjugateJapanese(dictionaryWord, dictionaryReading, category, 'te');
        const teImasuKanji = teConj.kanji + 'います';
        const teImasuReading = teConj.reading + 'います';
        const teIruKanji = teConj.kanji + 'いる';
        const teIruReading = teConj.reading + 'いる';
        const normHira = toNormalizedHiragana(hiragana);

        if (
          normHira === toNormalizedHiragana(teImasuReading) ||
          input === teImasuKanji ||
          hiragana === teImasuReading
        ) {
          displayKanji = teImasuKanji;
          displayReading = teImasuReading;
          conjugationNote = `Forma progresiva (-te imasu) de ${dictionaryWord}`;
        } else if (
          normHira === toNormalizedHiragana(teIruReading) ||
          input === teIruKanji ||
          hiragana === teIruReading
        ) {
          displayKanji = teIruKanji;
          displayReading = teIruReading;
          conjugationNote = `Forma progresiva (-te iru) de ${dictionaryWord}`;
        } else {
          const forms: Array<{ type: JapaneseConjugationForm; note: string }> = [
            { type: 'masu', note: `Forma formal (-masu) de ${dictionaryWord}` },
            { type: 'mashita', note: `Pasado formal (-mashita) de ${dictionaryWord}` },
            { type: 'masen', note: `Negativo formal (-masen) de ${dictionaryWord}` },
            { type: 'mashou', note: `Volitiva (-mashou) de ${dictionaryWord}` },
            { type: 'te', note: `Forma -te de ${dictionaryWord}` },
            { type: 'ta', note: `Pasado (-ta) de ${dictionaryWord}` },
            { type: 'nai', note: `Negativo (-nai) de ${dictionaryWord}` },
            { type: 'nakatta', note: `Pasado negativo (-nakatta) de ${dictionaryWord}` },
            { type: 'nakute', note: `Forma -te negativa de ${dictionaryWord}` },
            { type: 'adverbial', note: `Forma adverbial de ${dictionaryWord}` },
          ];

          for (const f of forms) {
            const conj = conjugateJapanese(dictionaryWord, dictionaryReading, category, f.type);
            if (
              conj.reading === hiragana ||
              conj.kanji === input ||
              conj.kanji === hiragana ||
              toNormalizedHiragana(conj.reading) === normHira
            ) {
              displayKanji = conj.kanji;
              displayReading = conj.reading;
              conjugationNote = f.note;
              break;
            }
          }
        }
      }

      const topDefs = rawEnglishDefinitions.slice(0, 4);
      allDefinitionsToTranslate.push(...topDefs);

      preparedItems.push({
        item,
        dictionaryWord,
        dictionaryReading,
        jlptLevel,
        category,
        displayKanji,
        displayReading,
        conjugationNote,
        rawDefinitions: topDefs,
      });
    }

    // Traducir todas las definiciones en una única llamada por lotes (con caché inteligente)
    await translateBatchToSpanish(allDefinitionsToTranslate, 'en');

    // Construir las entradas con sus traducciones garantizadas al español
    const entries: JapaneseEntry[] = [];

    for (let i = 0; i < preparedItems.length; i++) {
      const p = preparedItems[i];
      const translatedMeanings = await translateBatchToSpanish(p.rawDefinitions, 'en');

      // Limpiar, desduplicar y capitalizar cada significado preservando paréntesis
      let finalMeanings = cleanAndFormatMeanings(translatedMeanings);
      if (p.conjugationNote && finalMeanings.length > 0) {
        finalMeanings = [`[${p.conjugationNote}] ${finalMeanings[0]}`, ...finalMeanings.slice(1)];
      }

      const hasConjugation = Boolean(p.conjugationNote) || (p.displayKanji !== p.dictionaryWord || p.displayReading !== p.dictionaryReading);

      entries.push({
        id: `ja_${i}_${p.displayKanji}_${p.displayReading}`,
        kanji: p.displayKanji,
        reading: p.displayReading,
        romaji: input.toLowerCase(),
        meanings: finalMeanings.length > 0 ? finalMeanings : ['Sin definición disponible'],
        isCommon: p.item.is_common === true,
        level: p.jlptLevel,
        category: p.category,
        detectedConjugation: p.conjugationNote || undefined,
        dictionaryForm: hasConjugation ? {
          kanji: p.dictionaryWord,
          reading: p.dictionaryReading,
          meanings: cleanAndFormatMeanings(translatedMeanings),
        } : undefined,
      });
    }

    // Desduplicación estricta de entradas idénticas o duplicadas (Kana vs Kanji o mismo significado)
    const uniqueEntries: JapaneseEntry[] = [];
    const seenKeys = new Map<string, JapaneseEntry>();

    for (const entry of entries) {
      const lowerReading = entry.reading.toLowerCase();
      const firstMeaning = (entry.meanings[0] || '').toLowerCase().trim();
      const hasKanji = /[\u4e00-\u9faf]/.test(entry.kanji);

      // Clave 1: Mismo kanji y misma lectura (duplicado directo)
      const exactKey = `${entry.kanji.toLowerCase()}_${lowerReading}`;
      // Clave 2: Misma lectura y mismo significado principal (variante redundante)
      const semanticKey = `${lowerReading}_${firstMeaning}`;

      if (seenKeys.has(exactKey)) {
        continue;
      }

      const existingSemantic = seenKeys.get(semanticKey);
      if (existingSemantic) {
        const existingHasKanji = /[\u4e00-\u9faf]/.test(existingSemantic.kanji);
        if (!existingHasKanji && hasKanji) {
          // Reemplazar versión Kana-only por la versión con Kanji
          const idx = uniqueEntries.indexOf(existingSemantic);
          if (idx !== -1) {
            uniqueEntries[idx] = entry;
          }
          seenKeys.set(semanticKey, entry);
          seenKeys.set(exactKey, entry);
        }
        continue;
      }

      seenKeys.set(exactKey, entry);
      seenKeys.set(semanticKey, entry);
      uniqueEntries.push(entry);
    }

    if (phraseEntry) {
      return [phraseEntry, ...uniqueEntries];
    }

    return uniqueEntries;
  } catch (error) {
    console.warn('Error en búsqueda de japonés:', error);
    return [];
  }
}

