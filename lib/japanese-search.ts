import { romajiToHiragana, containsJapanese, deconjugateJapanese, classifyJapaneseWord } from './japanese-utils';
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
 * Limpia, desduplica y capitaliza cada significado individual de un array o string.
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
    let cleanedStr = String(item);
    // Separar palabras compuestas concatenadas sin espacio tras traduccion
    cleanedStr = cleanedStr
      .replace(/buquehospital/gi, 'buque hospital')
      .replace(/hospitalgeneral/gi, 'hospital general')
      .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2');

    const parts = cleanedStr.split(/[,;]/);
    for (const part of parts) {
      const trimmed = part.trim();
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

/**
 * Traduce un texto al español (desde inglés por defecto o japonés si se especifica).
 */
async function translateToSpanish(text: string, fromLang: 'en' | 'ja' = 'en'): Promise<string> {
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${fromLang}&tl=es&dt=t&q=${encodeURIComponent(text)}`
    );
    const data = await res.json();
    if (data && data[0] && data[0][0] && data[0][0][0]) {
      const translated = data[0][0][0].trim();
      return capitalizeFirst(translated);
    }
  } catch (e) {
    // Si falla, se devuelve el texto original capitalizado
  }
  return capitalizeFirst(text);
}

/**
 * Mapea las partes de la oración (parts_of_speech) devueltas por JMdict/Jisho
 * a categorías estandarizadas en español (Verbo Ichidan, Verbo Godan, etc.)
 */
export function mapJishoPartsOfSpeech(partsOfSpeech: string[], word: string, reading: string): string {
  if (!partsOfSpeech || partsOfSpeech.length === 0) {
    return classifyJapaneseWord(word, reading);
  }

  const joined = partsOfSpeech.join(' ').toLowerCase();

  if (joined.includes('suru verb') || joined.includes('kuru verb')) {
    return 'Verbo Irregular (Grupo 3)';
  }
  if (joined.includes('ichidan verb')) {
    return 'Verbo Ichidan (Grupo 2)';
  }
  if (joined.includes('godan verb')) {
    return 'Verbo Godan (Grupo 1)';
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

  // Consultar en Jisho EXCLUSIVAMENTE en Kana/Kanji japonés (nunca en romaji difuso que trae basura en inglés/química)
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

    // Buscar en paralelo tanto la consulta directa como las formas de diccionario desconjugadas
    const queryPromises = queryTerms.map(async (term) => {
      try {
        const res = await fetch(
          `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(term)}`
        );
        if (!res.ok) return [];
        const json = await res.json();
        return Array.isArray(json?.data) ? json.data : [];
      } catch {
        return [];
      }
    });

    const resultsArray = await Promise.all(queryPromises);
    const combinedData: any[] = [];
    const seenSlugs = new Set<string>();

    for (const dataList of resultsArray) {
      for (const item of dataList) {
        const japaneseObj = item.japanese && item.japanese[0] ? item.japanese[0] : {};
        const word = japaneseObj.word || '';
        const reading = japaneseObj.reading || '';
        
        // FILTRADO ESTRICTO: Descartar entradas que no tengan ninguna relación con los caracteres japoneses buscados
        const matchesQuery = queryTerms.some((qt) => 
          word.includes(qt) || reading.includes(qt) || qt.includes(reading) || qt.includes(word)
        );

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

    // Ordenar resultados con máxima prioridad a la palabra exacta o su forma de diccionario común:
    // 1. Coincidencia exacta de lectura o kanji con alguna forma desconjugada + es común (ej. 食べる)
    // 2. Coincidencia exacta con alguna forma desconjugada
    // 3. Palabra común general
    // 4. Frases o compuestos largos (penalizados por longitud)
    const sortedData = combinedData.sort((a, b) => {
      const aObj = a.japanese && a.japanese[0] ? a.japanese[0] : {};
      const bObj = b.japanese && b.japanese[0] ? b.japanese[0] : {};

      const aWord = (aObj.word || '').toLowerCase();
      const aReading = (aObj.reading || '').toLowerCase();
      const bWord = (bObj.word || '').toLowerCase();
      const bReading = (bObj.reading || '').toLowerCase();

      const aExact = matchTargets.has(aWord) || matchTargets.has(aReading);
      const bExact = matchTargets.has(bWord) || matchTargets.has(bReading);

      const aCommon = a.is_common === true;
      const bCommon = b.is_common === true;

      const aLen = (aObj.word || aObj.reading || '').length;
      const bLen = (bObj.word || bObj.reading || '').length;

      // Puesto 1: Palabra exacta y común (ej: 食べる)
      if (aExact && aCommon && (!bExact || !bCommon)) return -1;
      if (bExact && bCommon && (!aExact || !aCommon)) return 1;

      // Puesto 2: Palabra exacta aunque no tenga etiqueta is_common
      if (aExact && !bExact) return -1;
      if (bExact && !aExact) return 1;

      // Puesto 3: Palabras comunes más cortas
      if (aCommon && !bCommon) return -1;
      if (bCommon && !aCommon) return 1;

      return aLen - bLen;
    });

    const topResults = sortedData.slice(0, 8);
    const entries: JapaneseEntry[] = [];

    for (let i = 0; i < topResults.length; i++) {
      const item = topResults[i];
      const japaneseObj = item.japanese && item.japanese[0] ? item.japanese[0] : {};
      
      const dictionaryWord = japaneseObj.word || japaneseObj.reading || input;
      const dictionaryReading = japaneseObj.reading || japaneseObj.word || hiragana;

      // Si el usuario buscó una forma conjugada específica (ej. "tabete" / "たべて"),
      // y la entrada encontrada es su forma de diccionario (ej. 食べる),
      // adaptamos el título para que muestre exactamente lo que buscó el usuario con su kanji conjugado
      let displayKanji = dictionaryWord;
      let displayReading = dictionaryReading;
      let conjugationNote = '';

      if (
        (input.toLowerCase() !== dictionaryWord.toLowerCase() && input.toLowerCase() !== dictionaryReading.toLowerCase()) &&
        (hiragana !== dictionaryWord && hiragana !== dictionaryReading)
      ) {
        // Ejemplo: Si buscó "tabete" / "たべて" y el diccionario devolvió "食べる"
        if (hiragana.endsWith('て') && dictionaryReading.endsWith('る')) {
          const kanjiStem = dictionaryWord.endsWith('る') ? dictionaryWord.slice(0, -1) : dictionaryWord;
          displayKanji = `${kanjiStem}て`;
          displayReading = hiragana;
          conjugationNote = `Forma -te de ${dictionaryWord}`;
        } else if (hiragana.endsWith('で') && dictionaryReading.endsWith('む')) {
          const kanjiStem = dictionaryWord.endsWith('む') ? dictionaryWord.slice(0, -1) : dictionaryWord;
          displayKanji = `${kanjiStem}で`;
          displayReading = hiragana;
          conjugationNote = `Forma -te de ${dictionaryWord}`;
        } else if (hiragana.endsWith('た') && dictionaryReading.endsWith('る')) {
          const kanjiStem = dictionaryWord.endsWith('る') ? dictionaryWord.slice(0, -1) : dictionaryWord;
          displayKanji = `${kanjiStem}た`;
          displayReading = hiragana;
          conjugationNote = `Forma pasado (-ta) de ${dictionaryWord}`;
        } else if (hiragana.endsWith('ない') && dictionaryReading.endsWith('る')) {
          const kanjiStem = dictionaryWord.endsWith('る') ? dictionaryWord.slice(0, -1) : dictionaryWord;
          displayKanji = `${kanjiStem}ない`;
          displayReading = hiragana;
          conjugationNote = `Forma negativa (-nai) de ${dictionaryWord}`;
        } else if (hiragana.endsWith('ます') && dictionaryReading.endsWith('る')) {
          const kanjiStem = dictionaryWord.endsWith('る') ? dictionaryWord.slice(0, -1) : dictionaryWord;
          displayKanji = `${kanjiStem}ます`;
          displayReading = hiragana;
          conjugationNote = `Forma cortés (-masu) de ${dictionaryWord}`;
        }
      }

      // Extraer nivel JLPT (priorizando diccionario de expresiones cotidianas N5/N4)
      let jlptLevel: string | undefined = getQuickJlptLevel(dictionaryWord) || getQuickJlptLevel(dictionaryReading);
      if (!jlptLevel && item.jlpt && Array.isArray(item.jlpt) && item.jlpt.length > 0) {
        const match = item.jlpt[0].match(/n([1-5])/i);
        if (match) {
          jlptLevel = `N${match[1]}`;
        }
      }

      // Extraer definiciones en inglés y partes de la oración (parts_of_speech)
      const rawEnglishDefinitions: string[] = [];
      const partsOfSpeechList: string[] = [];
      if (item.senses && item.senses.length > 0) {
        for (const sense of item.senses) {
          if (Array.isArray(sense.parts_of_speech)) {
            partsOfSpeechList.push(...sense.parts_of_speech);
          }
        }
        for (const sense of item.senses.slice(0, 2)) {
          if (sense.english_definitions) {
            rawEnglishDefinitions.push(sense.english_definitions.join(', '));
          }
        }
      }

      // Clasificación estandarizada de categoría gramatical
      const category = mapJishoPartsOfSpeech(partsOfSpeechList, dictionaryWord, dictionaryReading);

      // Traducir definiciones al español en paralelo con primera letra mayúscula
      const translatedMeanings = await Promise.all(
        rawEnglishDefinitions.map((def) => translateToSpanish(def))
      );

      // Limpiar, desduplicar y capitalizar cada significado
      let finalMeanings = cleanAndFormatMeanings(translatedMeanings);
      if (conjugationNote && finalMeanings.length > 0) {
        finalMeanings = [`[${conjugationNote}] ${finalMeanings[0]}`, ...finalMeanings.slice(1)];
      }

      const hasConjugation = Boolean(conjugationNote) || (displayKanji !== dictionaryWord || displayReading !== dictionaryReading);

      entries.push({
        id: `ja_${i}_${displayKanji}_${displayReading}`,
        kanji: displayKanji,
        reading: displayReading,
        romaji: input.toLowerCase(),
        meanings: finalMeanings.length > 0 ? finalMeanings : ['Sin definición disponible'],
        isCommon: item.is_common === true,
        level: jlptLevel,
        category,
        detectedConjugation: conjugationNote || undefined,
        dictionaryForm: hasConjugation ? {
          kanji: dictionaryWord,
          reading: dictionaryReading,
          meanings: cleanAndFormatMeanings(translatedMeanings),
        } : undefined,
      });
    }

    if (phraseEntry) {
      return [phraseEntry, ...entries];
    }

    return entries;
  } catch (error) {
    console.warn('Error en búsqueda de japonés:', error);
    return [];
  }
}
