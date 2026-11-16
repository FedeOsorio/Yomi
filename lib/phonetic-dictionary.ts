import { toNormalizedHiragana } from './japanese-utils';

/**
 * Lecturas (kana) de una palabra en el diccionario japonés de la app (JMdict, palabras comunes). Lo usa la
 * práctica de conjugaciones para saber cómo se lee una respuesta escrita con kanji.
 */
type DictionaryLookup = (word: string) => string[];
let dictionaryLookup: DictionaryLookup | null = null;
const dictionaryCache = new Map<string, string[]>();

/** La app conecta acá su diccionario (ver DatabaseProvider); las pruebas, el suyo. */
export function setDictionaryLookup(lookup: DictionaryLookup | null): void {
  dictionaryLookup = lookup;
  dictionaryCache.clear();
}

/** Lecturas de una palabra o kanji en el diccionario. Vacío si no está (se prueban las lecturas de cada kanji). */
export function getReadingsForWord(wordText: string): string[] {
  const clean = (wordText || '').trim();
  if (!clean || !dictionaryLookup) return [];
  let readings = dictionaryCache.get(clean);
  if (!readings) {
    try {
      readings = [...new Set(dictionaryLookup(clean).map(toNormalizedHiragana).filter(Boolean))];
    } catch {
      readings = [];
    }
    dictionaryCache.set(clean, readings);
  }
  return readings;
}
