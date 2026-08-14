import { romajiToHiragana, containsJapanese } from './japanese-utils';

export interface JapaneseEntry {
  id: string;
  kanji: string;
  reading: string;
  romaji: string;
  meanings: string[];
  isCommon: boolean;
  level?: string; // 'N5', 'N4', 'N3', 'N2', 'N1'
}

/**
 * Traduce un texto o array de significados del inglés al español.
 */
async function translateToSpanish(text: string): Promise<string> {
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(text)}`
    );
    const data = await res.json();
    if (data && data[0] && data[0][0] && data[0][0][0]) {
      return data[0][0][0].trim();
    }
  } catch (e) {
    // Si falla, se devuelve el texto original
  }
  return text;
}

/**
 * Busca palabras en japonés (usando JMdict/Jisho) con ordenamiento inteligente por relevancia y uso común.
 */
export async function searchJapanese(rawInput: string): Promise<JapaneseEntry[]> {
  if (!rawInput || !rawInput.trim()) return [];

  const input = rawInput.trim();
  const hiragana = containsJapanese(input) ? input : romajiToHiragana(input);

  try {
    const response = await fetch(
      `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(hiragana || input)}`
    );

    if (!response.ok) return [];

    const json = await response.json();
    if (!json.data || json.data.length === 0) return [];

    // Ordenar resultados por relevancia:
    // 1. Coincidencia exacta de lectura/kanji + común (is_common)
    // 2. Coincidencia exacta de lectura/kanji
    // 3. Palabras comunes que empiezan con la sílaba
    // 4. Resto
    const sortedData = [...json.data].sort((a, b) => {
      const aObj = a.japanese && a.japanese[0] ? a.japanese[0] : {};
      const bObj = b.japanese && b.japanese[0] ? b.japanese[0] : {};

      const aExact = aObj.reading === hiragana || aObj.word === hiragana || aObj.word === input;
      const bExact = bObj.reading === hiragana || bObj.word === hiragana || bObj.word === input;

      const aCommon = a.is_common === true;
      const bCommon = b.is_common === true;

      if (aExact && aCommon && (!bExact || !bCommon)) return -1;
      if (bExact && bCommon && (!aExact || !aCommon)) return 1;
      if (aExact && !bExact) return -1;
      if (bExact && !aExact) return 1;
      if (aCommon && !bCommon) return -1;
      if (bCommon && !aCommon) return 1;

      return 0;
    });

    const topResults = sortedData.slice(0, 8);
    const entries: JapaneseEntry[] = [];

    for (let i = 0; i < topResults.length; i++) {
      const item = topResults[i];
      const japaneseObj = item.japanese && item.japanese[0] ? item.japanese[0] : {};
      
      const wordKanji = japaneseObj.word || japaneseObj.reading || input;
      const reading = japaneseObj.reading || japaneseObj.word || hiragana;

      // Extraer nivel JLPT (ej. 'jlpt-n5' -> 'N5')
      let jlptLevel: string | undefined = undefined;
      if (item.jlpt && Array.isArray(item.jlpt) && item.jlpt.length > 0) {
        const match = item.jlpt[0].match(/n([1-5])/i);
        if (match) {
          jlptLevel = `N${match[1]}`;
        }
      }

      // Extraer definiciones en inglés
      const rawEnglishDefinitions: string[] = [];
      if (item.senses && item.senses.length > 0) {
        for (const sense of item.senses.slice(0, 2)) {
          if (sense.english_definitions) {
            rawEnglishDefinitions.push(sense.english_definitions.join(', '));
          }
        }
      }

      // Traducir definiciones al español
      const translatedMeanings: string[] = [];
      for (const def of rawEnglishDefinitions) {
        const es = await translateToSpanish(def);
        translatedMeanings.push(es);
      }

      entries.push({
        id: `ja_${i}_${wordKanji}_${reading}`,
        kanji: wordKanji,
        reading: reading,
        romaji: input.toLowerCase(),
        meanings: translatedMeanings.length > 0 ? translatedMeanings : ['Sin definición disponible'],
        isCommon: item.is_common === true,
        level: jlptLevel,
      });
    }

    return entries;
  } catch (error) {
    console.warn('Error en búsqueda de japonés:', error);
    return [];
  }
}
