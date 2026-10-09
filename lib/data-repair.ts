import { eq, like, sql } from 'drizzle-orm';
import { db } from '../db';
import { decks, srsItems, words } from '../db/schema';
import { resolveJapaneseReading } from './japanese-search';
import { classifyJapaneseWord, containsJapanese } from './japanese-utils';
import { registerWordInDictionary } from './phonetic-dictionary';
import { getStorageItem, setStorageItem } from './storage-service';
import { parseAux, stringifyAux } from './word-aux';
import { resolveJapaneseBaseForm } from './word-service';

/**
 * Reparaciones de datos que antes se hacían "al leer" (cada vez que se abría Repaso o una palabra).
 * Ahora corren UNA vez al iniciar la app, y otra vez después de restaurar una copia de seguridad
 * (una copia vieja puede traer los mismos datos mal guardados). Todas son idempotentes.
 */

const REPAIR_FLAG = 'yomi_data_repair_v1_done';

/** Mazos de japonés que versiones viejas crearon con idioma 'zh-CN'. */
async function fixJapaneseDecksMarkedAsChinese(): Promise<number> {
  const chineseDecks = await db.select({ id: decks.id }).from(decks).where(eq(decks.languageCode, 'zh-CN'));
  let fixed = 0;
  for (const deck of chineseDecks) {
    const sample = await db.select().from(words).where(eq(words.deckId, deck.id)).limit(5);
    const hasKana = sample.some(
      (w) =>
        /[぀-ヿ]/.test(w.pinyinDisplay || '') ||
        /[぀-ヿ]/.test(w.simplified || '') ||
        /[぀-ヿ]/.test(w.auxiliaryInfo || '')
    );
    if (hasKana) {
      await db.update(decks).set({ languageCode: 'ja-JP' }).where(eq(decks.id, deck.id));
      fixed++;
    }
  }
  return fixed;
}

/**
 * Palabras japonesas terminadas en kanji (右, 犬, 学校, 今日…) que quedaron clasificadas como
 * verbo / adjetivo -i, o con conjugaciones activadas, sin tener una forma base conjugable.
 */
async function fixMisclassifiedJapaneseWords(): Promise<number> {
  const rows = await db
    .select({ id: words.id, text: words.simplified, reading: words.pinyinDisplay, aux: words.auxiliaryInfo })
    .from(words)
    .innerJoin(decks, eq(words.deckId, decks.id))
    .where(like(decks.languageCode, 'ja%'));

  let fixed = 0;
  for (const row of rows) {
    const text = (row.text || '').trim();
    if (!row.aux || !/[一-龯]$/.test(text)) continue;
    const aux = parseAux(row.aux);
    if (resolveJapaneseBaseForm(text, row.reading || '', aux.kunReading || '')) continue;

    let dirty = false;
    if (aux.category?.startsWith('Verbo') || aux.category?.startsWith('Adjetivo -i')) {
      aux.category = classifyJapaneseWord(text, row.reading || '');
      dirty = true;
    }
    if (aux.conjugationEnabled) {
      delete aux.conjugationEnabled;
      dirty = true;
    }
    if (aux.dictionaryForm) {
      delete aux.dictionaryForm;
      dirty = true;
    }
    if (dirty) {
      await db.update(words).set({ auxiliaryInfo: stringifyAux(aux) }).where(eq(words.id, row.id));
      fixed++;
    }
  }
  return fixed;
}

/** Corre las reparaciones de datos. Sin `force`, solo la primera vez. */
export async function runDataRepair(force = false): Promise<void> {
  if (!force && (await getStorageItem(REPAIR_FLAG)) === 'true') return;
  try {
    const decksFixed = await fixJapaneseDecksMarkedAsChinese();
    const wordsFixed = await fixMisclassifiedJapaneseWords();
    console.log(`[DataRepair] Mazos corregidos: ${decksFixed}, palabras corregidas: ${wordsFixed}`);
    await setStorageItem(REPAIR_FLAG, 'true');
  } catch (err) {
    // Sin marca: se reintenta en el próximo inicio
    console.warn('[DataRepair] Error reparando datos:', err);
  }
}

let backfillRunning = false;

/**
 * Completa la lectura de tarjetas japonesas que no la tienen (típico en mazos importados de Anki).
 * Puede consultar internet, por eso corre en segundo plano y nunca durante una sesión de repaso.
 * Si no hay tarjetas sin lectura, es una sola consulta a la base de datos.
 */
export async function backfillMissingReadings(): Promise<void> {
  if (backfillRunning) return;
  backfillRunning = true;
  try {
    const cards = await db
      .select({ id: srsItems.id, itemId: srsItems.itemId, text: srsItems.displayText, lang: decks.languageCode })
      .from(srsItems)
      .innerJoin(words, eq(srsItems.itemId, words.id))
      .leftJoin(decks, eq(words.deckId, decks.id))
      .where(sql`trim(${srsItems.displayReading}) = ''`);

    for (const card of cards) {
      const isJapanese = (card.lang || '').toLowerCase().startsWith('ja') || containsJapanese(card.text || '');
      if (!isJapanese || !card.text) continue;
      try {
        const reading = await resolveJapaneseReading(card.text);
        if (!reading) continue;
        await db.update(srsItems).set({ displayReading: reading }).where(eq(srsItems.id, card.id));
        await db.update(words).set({ pinyinDisplay: reading, pinyinNumeric: reading.toLowerCase() }).where(eq(words.id, card.itemId));
        registerWordInDictionary(card.text, reading);
      } catch {}
    }
    if (cards.length > 0) console.log(`[DataRepair] Lecturas revisadas: ${cards.length}`);
  } catch (err) {
    console.warn('[DataRepair] Error completando lecturas:', err);
  } finally {
    backfillRunning = false;
  }
}
