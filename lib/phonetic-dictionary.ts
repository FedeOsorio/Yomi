import { toNormalizedHiragana } from './japanese-utils';
import { parseAux } from './word-aux';

/**
 * Índice en memoria palabra → lecturas (kana), construido con el vocabulario de los mazos del usuario.
 * El evaluador de voz lo usa para saber cómo se lee una palabra en kanji que devolvió el reconocedor
 * (p. ej. el reconocedor escribe "学校" y la tarjeta espera "がっこう").
 */
const wordToReadings = new Map<string, Set<string>>();

function splitReadings(raw: string): string[] {
  return raw
    .split(/[\/\n,、;•|]/)
    .map((r) => toNormalizedHiragana(r.replace(/^(on|kun|音|訓)[:：\s]*/i, '').replace(/[・~～\s()（）\-.]/g, '')))
    .filter(Boolean);
}

async function loadFromDatabase(): Promise<void> {
  const { db } = await import('../db');
  const { srsItems, words } = await import('../db/schema');
  if (!db) return;

  const srsList = await db.select({ text: srsItems.displayText, reading: srsItems.displayReading }).from(srsItems);
  srsList.forEach((item) => registerWordInDictionary(item.text, item.reading));

  const wordsList = await db
    .select({ text: words.simplified, reading: words.pinyinDisplay, aux: words.auxiliaryInfo })
    .from(words);
  for (const w of wordsList) {
    registerWordInDictionary(w.text, w.reading);
    // Sólo se parsea el JSON si trae lecturas de kanji (kanjiReadings / onReading / kunReading)
    if (!w.aux || !w.aux.includes('Reading')) continue;
    const aux = parseAux(w.aux);
    [aux.kanjiReadings, aux.onReading, aux.kunReading].forEach((r) => registerWordInDictionary(w.text, r));
  }
}

let loading: Promise<void> | null = null;

/**
 * Carga el vocabulario de la base de datos en el índice. Lo hace una sola vez: con miles de palabras,
 * releer todo cada vez que se abre Repaso es caro. Las palabras nuevas se agregan con
 * registerWordInDictionary, y después de importar o restaurar se recarga (invalidatePhoneticDictionary).
 */
export function initPhoneticDictionary(): Promise<void> {
  if (!loading) {
    loading = loadFromDatabase().catch((err) => {
      loading = null;
      console.warn('[PhoneticDictionary] No se pudo cargar el vocabulario:', err);
    });
  }
  return loading;
}

/** La próxima llamada a initPhoneticDictionary vuelve a leer la base (después de importar o restaurar). */
export function invalidatePhoneticDictionary(): void {
  loading = null;
}

/** Registra una palabra y su(s) lectura(s). */
export function registerWordInDictionary(rawText?: string | null, rawReading?: string | null): void {
  const text = (rawText || '').trim();
  const reading = (rawReading || '').trim();
  if (!text || !reading) return;
  const set = wordToReadings.get(text) ?? new Set<string>();
  splitReadings(reading).forEach((r) => set.add(r));
  wordToReadings.set(text, set);
}

/** Lecturas de una palabra en el diccionario japonés de la app (JMdict, palabras comunes). */
type DictionaryLookup = (word: string) => string[];
let dictionaryLookup: DictionaryLookup | null = null;
const dictionaryCache = new Map<string, string[]>();

/** La app conecta acá su diccionario (ver DatabaseProvider); las pruebas, el suyo. */
export function setDictionaryLookup(lookup: DictionaryLookup | null): void {
  dictionaryLookup = lookup;
  dictionaryCache.clear();
}

function dictionaryReadings(word: string): string[] {
  if (!dictionaryLookup) return [];
  let readings = dictionaryCache.get(word);
  if (!readings) {
    try {
      readings = dictionaryLookup(word).map(toNormalizedHiragana).filter(Boolean);
    } catch {
      readings = [];
    }
    dictionaryCache.set(word, readings);
  }
  return readings;
}

/** Pinyin de una palabra china en el diccionario de la app (CC-CEDICT), con tonos en números: "ni3 hao3". */
let chineseLookup: DictionaryLookup | null = null;
const chineseCache = new Map<string, string[]>();

export function setChineseDictionaryLookup(lookup: DictionaryLookup | null): void {
  chineseLookup = lookup;
  chineseCache.clear();
}

/** Pinyin (con tonos en números) de una palabra o hanzi en simplificado o tradicional. Vacío si no está. */
export function getPinyinForWord(wordText: string): string[] {
  const clean = (wordText || '').trim();
  if (!clean || !chineseLookup) return [];
  let pinyin = chineseCache.get(clean);
  if (!pinyin) {
    try {
      pinyin = chineseLookup(clean).filter(Boolean);
    } catch {
      pinyin = [];
    }
    chineseCache.set(clean, pinyin);
  }
  return pinyin;
}

/**
 * Lecturas (kana) de una palabra o kanji: las de los mazos del usuario y las del diccionario. Vacío si no está
 * en ninguno (entonces el evaluador prueba las lecturas del catálogo de cada kanji).
 */
export function getReadingsForWord(wordText: string): string[] {
  const clean = (wordText || '').trim();
  if (!clean) return [];
  return [...new Set([...(wordToReadings.get(clean) ?? []), ...dictionaryReadings(clean)])].filter(Boolean);
}
