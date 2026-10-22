import { eq, like, sql } from 'drizzle-orm';
import { Directory, File, Paths } from 'expo-file-system';
import { db } from '../db';
import { decks, srsItems, words } from '../db/schema';
import { resolveJapaneseReading } from './japanese-search';
import { classifyJapaneseWord, containsJapanese } from './japanese-utils';
import { registerWordInDictionary } from './phonetic-dictionary';
import { getKanjiLevel } from './kanji-search';
import { getStorageItem, setStorageItem } from './storage-service';
import { getMediaDir, invalidateMediaFilesCache, listMediaFiles, MEDIA_DIR, mediaFileName } from './media-service';
import { parseAux, stringifyAux } from './word-aux';
import { resolveJapaneseBaseForm } from './word-service';

/**
 * Reparaciones de datos que antes se hacían "al leer" (cada vez que se abría Repaso o una palabra).
 * Ahora corren UNA vez al iniciar la app, y otra vez después de restaurar una copia de seguridad
 * (una copia vieja puede traer los mismos datos mal guardados). Todas son idempotentes.
 */

const REPAIR_FLAG = 'yomi_data_repair_v1_done';
/** Reparaciones agregadas después de la v1 (corren una vez también en instalaciones que ya hicieron la v1). */
const REPAIR_FLAG_V2 = 'yomi_data_repair_v2_done';

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

/**
 * Tarjetas de un kanji suelto guardadas con el nivel JLPT de la PALABRA (員 sola figura como N1)
 * en vez del nivel del KANJI (員 es N4).
 */
async function fixSingleKanjiLevels(): Promise<number> {
  const rows = await db
    .select({ id: words.id, text: words.simplified, aux: words.auxiliaryInfo })
    .from(words)
    .innerJoin(decks, eq(words.deckId, decks.id))
    .where(like(decks.languageCode, 'ja%'));

  let fixed = 0;
  for (const row of rows) {
    const level = getKanjiLevel((row.text || '').trim());
    if (!level) continue;
    const aux = parseAux(row.aux);
    if (!aux.level || aux.level === level) continue;
    aux.level = level;
    await db.update(words).set({ auxiliaryInfo: stringifyAux(aux) }).where(eq(words.id, row.id));
    fixed++;
  }
  return fixed;
}

/** Corre las reparaciones de datos. Sin `force`, cada una solo la primera vez. */
export async function runDataRepair(force = false): Promise<void> {
  if (force || (await getStorageItem(REPAIR_FLAG)) !== 'true') {
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
  if (force || (await getStorageItem(REPAIR_FLAG_V2)) !== 'true') {
    try {
      const levelsFixed = await fixSingleKanjiLevels();
      console.log(`[DataRepair] Niveles de kanji corregidos: ${levelsFixed}`);
      await setStorageItem(REPAIR_FLAG_V2, 'true');
    } catch (err) {
      console.warn('[DataRepair] Error corrigiendo niveles de kanji:', err);
    }
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
      // Sólo texto con escritura japonesa: una tarjeta sin kana ni kanji (p. ej. un número) nunca va a tener
      // lectura, y se reintentaría en cada arranque. Los mazos chinos usan pinyin, no lectura japonesa.
      const isChineseDeck = (card.lang || '').toLowerCase().startsWith('zh');
      if (!card.text || isChineseDeck || !containsJapanese(card.text)) continue;
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

const TRASH_DIR = '.trash';
const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** En la papelera cada archivo se llama `<momento en que se desechó>__<nombre original>`. */
function parseTrashName(name: string): { trashedAt: number; fileName: string } | null {
  const match = name.match(/^(\d+)__(.+)$/);
  return match ? { trashedAt: Number(match[1]), fileName: match[2] } : null;
}

/** Nombres de archivo de `media/` que usa alguna palabra o el diseño de algún mazo de Anki (fuentes, CSS). */
async function getReferencedMediaFiles(): Promise<Set<string>> {
  const rows = await db
    .select({ aux: words.auxiliaryInfo })
    .from(words)
    .where(sql`${words.auxiliaryInfo} LIKE '%media/%'`);

  const referenced = new Set<string>();
  for (const row of rows) {
    for (const m of parseAux(row.aux).media ?? []) {
      if (m.path) referenced.add(mediaFileName(m.path));
    }
  }

  const designs = await db
    .select({ design: decks.ankiNoteTypes })
    .from(decks)
    .where(sql`${decks.ankiNoteTypes} IS NOT NULL`);
  for (const row of designs) {
    try {
      const files: Record<string, string> = JSON.parse(row.design!).files ?? {};
      for (const path of Object.values(files)) referenced.add(mediaFileName(path));
    } catch {}
  }
  return referenced;
}

/**
 * Mueve a `media/.trash/` los archivos de `media/` que ya no usa ninguna tarjeta
 * y purga de la papelera los que llevan más de 30 días ahí (como "Check Media" de Anki).
 */
export async function cleanOrphanMedia(): Promise<void> {
  try {
    const mediaDir = new Directory(Paths.document, MEDIA_DIR);
    if (!mediaDir.exists) return;

    const referenced = await getReferencedMediaFiles();
    const trashDir = new Directory(mediaDir, TRASH_DIR);
    trashDir.create({ idempotent: true });
    const now = Date.now();

    let movedToTrash = 0;
    for (const name of listMediaFiles()) {
      if (name.startsWith('.') || referenced.has(name)) continue;
      try {
        new File(mediaDir, name).moveSync(new File(trashDir, `${now}__${name}`));
        movedToTrash++;
      } catch (e) {
        console.warn(`[DataRepair] Error moviendo archivo huérfano a la papelera (${name}):`, e);
      }
    }
    if (movedToTrash > 0) invalidateMediaFilesCache();

    let purgedFromTrash = 0;
    for (const entry of trashDir.list()) {
      const trashedAt = parseTrashName(entry.name)?.trashedAt ?? 0;
      if (trashedAt > 0 && now - trashedAt > TRASH_TTL_MS) {
        try {
          entry.delete();
          purgedFromTrash++;
        } catch {}
      }
    }

    if (movedToTrash > 0 || purgedFromTrash > 0) {
      console.log(`[DataRepair] Limpieza multimedia: ${movedToTrash} movidos a papelera, ${purgedFromTrash} eliminados definitivamente`);
    }
  } catch (err) {
    console.warn('[DataRepair] Error en cleanOrphanMedia:', err);
  }
}

/**
 * Después de restaurar un backup: devuelve a `media/` los archivos de la papelera
 * que alguna palabra vuelve a usar.
 */
export async function rescueTrashedMedia(): Promise<number> {
  try {
    const trashDir = new Directory(Paths.document, MEDIA_DIR, TRASH_DIR);
    if (!trashDir.exists) return 0;

    const referenced = await getReferencedMediaFiles();
    if (referenced.size === 0) return 0;
    const mediaDir = getMediaDir();

    let rescued = 0;
    for (const entry of trashDir.list()) {
      const fileName = parseTrashName(entry.name)?.fileName ?? entry.name;
      const dest = new File(mediaDir, fileName);
      if (!(entry instanceof File) || !referenced.has(fileName) || dest.exists) continue;
      try {
        entry.moveSync(dest);
        rescued++;
      } catch (e) {
        console.warn('[rescueTrashedMedia] Error rescatando archivo de papelera:', entry.name, e);
      }
    }
    if (rescued > 0) invalidateMediaFilesCache();
    return rescued;
  } catch (err) {
    console.warn('[rescueTrashedMedia] Error general rescatando multimedia:', err);
    return 0;
  }
}
