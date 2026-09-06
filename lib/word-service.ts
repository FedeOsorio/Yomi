import { db } from '../db';
import { words, decks, srsItems } from '../db/schema';
import { dictionaryEntries } from '../db/dict-schema';
import { eq, and, like, ne } from 'drizzle-orm';
import { createNewSrsItem } from './srs-engine';
import { DictionaryEntry } from './search-engine';
import { searchJapanese, extractKanjis, cleanAndFormatMeanings } from './japanese-search';
import { classifyJapaneseWord } from './japanese-utils';

import * as crypto from 'expo-crypto';

function generateUUID(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface CompoundWord {
  id: string;
  simplified: string;
  pinyinDisplay: string;
  meanings: string; // JSON string
}

export interface WordDetailWithRelations {
  word: typeof words.$inferSelect;
  deck: typeof decks.$inferSelect | null;
  srsItem: typeof srsItems.$inferSelect | null;
  meaningsList: string[];
  compoundWords: CompoundWord[];
  level?: string;
  category?: string;
  conjugationEnabled?: boolean;
}

/**
 * Busca palabras compuestas comunes detectando el idioma del mazo (Japonés con Hiragana vs Chino con Pinyin)
 * y garantizando que palabras de 2+ Kanjis incluyan la combinación completa de caracteres.
 */
export async function getCompoundWordsForChar(
  wordText: string,
  limit: number = 3,
  languageCode: string = 'zh-CN'
): Promise<CompoundWord[]> {
  if (!wordText || !wordText.trim()) return [];
  const trimmed = wordText.trim();
  const isJapanese = languageCode.startsWith('ja');
  const kanjis = extractKanjis(trimmed);

  if (isJapanese) {
    try {
      const searchKey = kanjis.length >= 2 ? trimmed : (kanjis[0] || trimmed);
      const results = await searchJapanese(searchKey);

      const filtered = results.filter((entry) => {
        if (entry.kanji === trimmed) return false;
        if (kanjis.length >= 2) {
          return entry.kanji.includes(trimmed) || kanjis.every((k) => entry.kanji.includes(k));
        }
        return entry.kanji.includes(searchKey) && entry.kanji.length >= 2;
      });

      return filtered.slice(0, limit).map((entry) => ({
        id: entry.id,
        simplified: entry.kanji,
        pinyinDisplay: entry.reading,
        meanings: JSON.stringify(entry.meanings),
      }));
    } catch (e) {
      console.warn('Error al buscar palabras compuestas en japonés:', e);
      return [];
    }
  }

  // Para mazos en Chino: busca en el diccionario CC-CEDICT local con lecturas en Pinyin
  try {
    const searchCondition = kanjis.length >= 2
      ? like(dictionaryEntries.simplified, `%${trimmed}%`)
      : like(dictionaryEntries.simplified, `%${kanjis[0] || trimmed}%`);

    const rawMatches = await db
      .select()
      .from(dictionaryEntries)
      .where(
        and(
          searchCondition,
          ne(dictionaryEntries.simplified, trimmed)
        )
      )
      .limit(limit * 4);

    const filtered = rawMatches
      .filter((entry) => {
        if (kanjis.length >= 2) {
          return entry.simplified.includes(trimmed) || kanjis.every((k) => entry.simplified.includes(k));
        }
        return entry.simplified.length >= 2 && entry.simplified.length <= 4;
      })
      .slice(0, limit);

    return filtered.map((entry) => {
      let parsedMeanings: string[] = [];
      try {
        parsedMeanings = JSON.parse(entry.meanings);
      } catch {
        parsedMeanings = [entry.meanings];
      }
      return {
        id: String(entry.id),
        simplified: entry.simplified,
        pinyinDisplay: entry.pinyinDisplay,
        meanings: JSON.stringify(parsedMeanings),
      };
    });
  } catch (error) {
    console.warn('Error buscando palabras compuestas en chino:', error);
    return [];
  }
}

export async function getWordDetailWithRelations(
  wordId: string
): Promise<WordDetailWithRelations | null> {
  const wordResult = await db
    .select()
    .from(words)
    .where(eq(words.id, wordId))
    .limit(1);

  if (wordResult.length === 0) return null;
  const word = wordResult[0];

  const deckResult = await db
    .select()
    .from(decks)
    .where(eq(decks.id, word.deckId))
    .limit(1);
  const deck = deckResult.length > 0 ? deckResult[0] : null;

  const srsResult = await db
    .select()
    .from(srsItems)
    .where(
      and(
        eq(srsItems.itemType, 'word'),
        eq(srsItems.itemId, wordId)
      )
    )
    .limit(1);
  const srsItem = srsResult.length > 0 ? srsResult[0] : null;

  let meaningsList: string[] = [];
  try {
    meaningsList = JSON.parse(word.meanings);
  } catch {
    meaningsList = [word.meanings];
  }

  let level: string | undefined;
  let category: string | undefined;
  let conjugationEnabled: boolean | undefined;
  if (word.auxiliaryInfo) {
    try {
      const parsedAux = JSON.parse(word.auxiliaryInfo);
      level = parsedAux.level;
      category = parsedAux.category;
      conjugationEnabled = parsedAux.conjugationEnabled;
    } catch {}
  }

  return {
    word,
    deck,
    srsItem,
    meaningsList,
    compoundWords: [],
    level,
    category,
    conjugationEnabled,
  };
}

export async function saveWords(
  deckId: string,
  selectedEntries: DictionaryEntry[],
  level?: string,
  category?: string
): Promise<void> {
  for (const entry of selectedEntries) {
    const pinyinNum = entry.pinyinNumeric || entry.pinyinDisplay || '';
    const existing = await db
      .select()
      .from(words)
      .where(
        and(
          eq(words.deckId, deckId),
          eq(words.simplified, entry.simplified)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      continue;
    }

    const wordId = generateUUID();
    const auxObj: Record<string, any> = {};
    if (level) auxObj.level = level;
    if (category) auxObj.category = category;
    const auxInfo = Object.keys(auxObj).length > 0 ? JSON.stringify(auxObj) : null;

    await db.insert(words).values({
      id: wordId,
      deckId,
      simplified: entry.simplified,
      traditional: entry.traditional || entry.simplified,
      pinyinDisplay: entry.pinyinDisplay || '',
      pinyinNumeric: pinyinNum,
      meanings: entry.meanings || '[]',
      auxiliaryInfo: auxInfo,
      createdAt: new Date(),
    });

    const srsInsert = createNewSrsItem('word', wordId, {
      displayText: entry.simplified,
      displayReading: entry.pinyinDisplay || '',
      displayMeaning: entry.meanings || '[]',
    });

    await db.insert(srsItems).values(srsInsert);
  }
}

export async function saveCustomWord(
  deckId: string,
  data: {
    simplified: string;
    pinyinDisplay: string;
    meanings: string;
    level?: string;
    category?: string;
    conjugationEnabled?: boolean;
  }
): Promise<void> {
  const wordId = generateUUID();
  const meaningsJson = data.meanings.startsWith('[') ? data.meanings : JSON.stringify([data.meanings]);
  const auxObj: Record<string, any> = {};
  if (data.level) auxObj.level = data.level;
  if (data.category) auxObj.category = data.category;
  if (data.conjugationEnabled !== undefined) auxObj.conjugationEnabled = data.conjugationEnabled;
  const auxInfo = Object.keys(auxObj).length > 0 ? JSON.stringify(auxObj) : null;

  await db.insert(words).values({
    id: wordId,
    deckId,
    simplified: data.simplified,
    traditional: data.simplified,
    pinyinDisplay: data.pinyinDisplay,
    pinyinNumeric: data.pinyinDisplay.toLowerCase(),
    meanings: meaningsJson,
    auxiliaryInfo: auxInfo,
    createdAt: new Date(),
  });

  const srsInsert = createNewSrsItem('word', wordId, {
    displayText: data.simplified,
    displayReading: data.pinyinDisplay,
    displayMeaning: meaningsJson,
  });

  await db.insert(srsItems).values(srsInsert);
}

export async function saveGenericWord(
  deckId: string,
  data: {
    text: string;
    reading?: string;
    meanings: string;
    level?: string;
    category?: string;
    conjugationEnabled?: boolean;
  }
): Promise<void> {
  const wordId = generateUUID();
  const meaningsJson = data.meanings.startsWith('[') ? data.meanings : JSON.stringify([data.meanings]);
  const auxObj: Record<string, any> = {};
  if (data.level) auxObj.level = data.level;
  if (data.category) auxObj.category = data.category;
  if (data.conjugationEnabled !== undefined) auxObj.conjugationEnabled = data.conjugationEnabled;
  const auxInfo = Object.keys(auxObj).length > 0 ? JSON.stringify(auxObj) : null;

  await db.insert(words).values({
    id: wordId,
    deckId,
    simplified: data.text.trim(),
    traditional: data.text.trim(),
    pinyinDisplay: data.reading?.trim() || '',
    pinyinNumeric: data.reading?.trim().toLowerCase() || '',
    meanings: meaningsJson,
    auxiliaryInfo: auxInfo,
    createdAt: new Date(),
  });

  const srsInsert = createNewSrsItem('word', wordId, {
    displayText: data.text.trim(),
    displayReading: data.reading?.trim() || '',
    displayMeaning: meaningsJson,
  });

  await db.insert(srsItems).values(srsInsert);
}

export async function deleteWord(wordId: string): Promise<void> {
  await db.delete(words).where(eq(words.id, wordId));
  await db.delete(srsItems).where(
    and(
      eq(srsItems.itemType, 'word'),
      eq(srsItems.itemId, wordId)
    )
  );
}

/**
 * Actualiza la selección personalizada de significados para una palabra guardada.
 * Persiste los significados seleccionados en srsItems.displayMeaning para que el repaso
 * solo evalúe y muestre los elegidos por el usuario, y en words.auxiliaryInfo.
 */
export async function updateWordSelectedMeanings(
  wordId: string,
  selectedMeanings: string[]
): Promise<void> {
  const selectedJson = JSON.stringify(selectedMeanings);

  const existingWords = await db.select().from(words).where(eq(words.id, wordId)).limit(1);
  if (existingWords.length > 0) {
    const word = existingWords[0];
    let auxObj: Record<string, any> = {};
    if (word.auxiliaryInfo) {
      try {
        auxObj = JSON.parse(word.auxiliaryInfo);
      } catch (e) {}
    }
    auxObj.selectedMeanings = selectedMeanings;

    await db.update(words)
      .set({ auxiliaryInfo: JSON.stringify(auxObj) })
      .where(eq(words.id, wordId));
  }

  await db.update(srsItems)
    .set({ displayMeaning: selectedJson })
    .where(
      and(
        eq(srsItems.itemType, 'word'),
        eq(srsItems.itemId, wordId)
      )
    );
}

/**
 * Elimina definitivamente un significado de la lista de la palabra (words.meanings),
 * eliminándolo también de selectedMeanings y de srsItems.displayMeaning.
 */
export async function deleteWordMeaning(
  wordId: string,
  meaningToDelete: string
): Promise<{ updatedMeanings: string[]; updatedSelected: string[] }> {
  const existingWords = await db.select().from(words).where(eq(words.id, wordId)).limit(1);
  if (existingWords.length === 0) {
    return { updatedMeanings: [], updatedSelected: [] };
  }

  const word = existingWords[0];
  const originalList = cleanAndFormatMeanings(word.meanings);
  const targetClean = meaningToDelete.trim().toLowerCase();

  // Filtrar el significado eliminado sobre la lista limpia y formateada
  const newMeaningsList = originalList.filter((m) => m.trim().toLowerCase() !== targetClean);
  const newMeaningsJson = JSON.stringify(newMeaningsList);

  let auxObj: Record<string, any> = {};
  let newSelected: string[] = [];

  if (word.auxiliaryInfo) {
    try {
      auxObj = JSON.parse(word.auxiliaryInfo);
      if (Array.isArray(auxObj.selectedMeanings)) {
        newSelected = auxObj.selectedMeanings.filter((m: string) => m.trim().toLowerCase() !== targetClean);
      }
    } catch (e) {}
  }

  if (newSelected.length === 0 && newMeaningsList.length > 0) {
    newSelected = [newMeaningsList[0]];
  }
  auxObj.selectedMeanings = newSelected;

  await db.update(words)
    .set({
      meanings: newMeaningsJson,
      auxiliaryInfo: JSON.stringify(auxObj),
    })
    .where(eq(words.id, wordId));

  await db.update(srsItems)
    .set({ displayMeaning: JSON.stringify(newSelected) })
    .where(
      and(
        eq(srsItems.itemType, 'word'),
        eq(srsItems.itemId, wordId)
      )
    );

  return { updatedMeanings: newMeaningsList, updatedSelected: newSelected };
}

/**
 * Inserta un lote masivo de palabras importadas en un mazo, evitando duplicados
 * y generando sus correspondientes tarjetas SRS FSRS.
 */
export async function saveBatchWords(
  deckId: string,
  items: Array<{
    text: string;
    reading?: string;
    meanings: string[];
    level?: string;
  }>
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  // Obtener palabras existentes en el mazo para deduplicación en memoria
  const existingRows = await db
    .select({ simplified: words.simplified, reading: words.pinyinDisplay })
    .from(words)
    .where(eq(words.deckId, deckId));

  const existingSet = new Set(
    existingRows.map((r) => `${r.simplified.trim()}__${(r.reading || '').trim().toLowerCase()}`)
  );

  for (const item of items) {
    const cleanText = item.text.trim();
    const cleanReading = (item.reading || '').trim();
    if (!cleanText) continue;

    const key = `${cleanText}__${cleanReading.toLowerCase()}`;
    if (existingSet.has(key)) {
      skipped++;
      continue;
    }

    const wordId = generateUUID();
    const meaningsJson = JSON.stringify(item.meanings.length > 0 ? item.meanings : [cleanText]);
    const auxInfo = item.level ? JSON.stringify({ level: item.level.trim() }) : null;

    await db.insert(words).values({
      id: wordId,
      deckId,
      simplified: cleanText,
      traditional: cleanText,
      pinyinDisplay: cleanReading,
      pinyinNumeric: cleanReading.toLowerCase(),
      meanings: meaningsJson,
      auxiliaryInfo: auxInfo,
      createdAt: new Date(),
    });

    const srsInsert = createNewSrsItem('word', wordId, {
      displayText: cleanText,
      displayReading: cleanReading,
      displayMeaning: meaningsJson,
    });

    await db.insert(srsItems).values(srsInsert);
    existingSet.add(key);
    inserted++;
  }

  return { inserted, skipped };
}

export interface ConjugableWord {
  id: string;
  kanji: string;
  reading: string;
  meanings: string[];
  category: string;
  level?: string;
}

/**
 * Obtiene todas las palabras de un mazo que son verbos o adjetivos (o tienen conjugación habilitada)
 * para realizar la práctica de conjugaciones.
 */
export async function getConjugableWordsForDeck(deckId: string): Promise<ConjugableWord[]> {
  const deckWords = await db.select().from(words).where(eq(words.deckId, deckId));
  const results: ConjugableWord[] = [];

  for (const w of deckWords) {
    let category = '';
    let level = '';
    let conjugationEnabled = false;

    if (w.auxiliaryInfo) {
      try {
        const aux = JSON.parse(w.auxiliaryInfo);
        category = aux.category || '';
        level = aux.level || '';
        conjugationEnabled = Boolean(aux.conjugationEnabled);
      } catch {}
    }

    // Si no tiene category explícita, intentar clasificar si es japonés
    if (!category) {
      const cleanReading = (w.pinyinDisplay || '').replace(/\s*\([^)]*\)/g, '').trim();
      category = classifyJapaneseWord(w.simplified, cleanReading);
    }

    const isConjugable =
      conjugationEnabled ||
      category.startsWith('Verbo') ||
      category.startsWith('Adjetivo');

    if (isConjugable) {
      let parsedMeanings: string[] = [];
      try {
        parsedMeanings = cleanAndFormatMeanings(w.meanings);
      } catch {
        parsedMeanings = [w.simplified];
      }

      results.push({
        id: w.id,
        kanji: w.simplified,
        reading: (w.pinyinDisplay || '').replace(/\s*\([^)]*\)/g, '').trim(),
        meanings: parsedMeanings,
        category,
        level: level || undefined,
      });
    }
  }

  return results;
}

