import { toNormalizedHiragana } from './japanese-utils';
import { KANJI_READINGS_MAP } from './kanji-readings-db';

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

/** Carga el vocabulario de la base de datos en el índice. */
export async function initPhoneticDictionary(): Promise<void> {
  try {
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
      if (!w.aux) continue;
      try {
        const aux = JSON.parse(w.aux);
        [aux.kanjiReadings, aux.onReading, aux.kunReading].forEach((r) => registerWordInDictionary(w.text, r));
      } catch {}
    }
  } catch (err) {
    console.warn('[PhoneticDictionary] No se pudo cargar el vocabulario:', err);
  }
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
