import { toNormalizedHiragana } from './japanese-utils';
import { KANJI_READINGS_MAP } from './kanji-readings-db';
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

/** Lecturas conocidas (kana) de una palabra o kanji. */
export function getReadingsForWord(wordText: string): string[] {
  const clean = (wordText || '').trim();
  if (!clean) return [];
  const results = new Set(wordToReadings.get(clean) ?? []);
  if (clean.length === 1 && KANJI_READINGS_MAP[clean]) {
    KANJI_READINGS_MAP[clean].forEach((r) => results.add(toNormalizedHiragana(r)));
  }
  results.delete('');
  return [...results];
}
