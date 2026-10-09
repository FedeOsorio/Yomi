import { and, eq, like, ne } from 'drizzle-orm';
import { db, dictDb } from '../db';
import { dictionaryEntries } from '../db/dict-schema';
import { decks, srsItems, words } from '../db/schema';
import { cleanHtmlAndAnkiTags, parseAnkiFuriganaSyntax } from './anki-importer';
import { cleanAndFormatMeanings, extractKanjis, searchJapanese, resolveJapaneseReading } from './japanese-search';
import { classifyJapaneseWord, deconjugateJapanese, isJapaneseDictionaryForm, toNormalizedHiragana, COMMON_KANA_NOUNS_AND_EXPRESSIONS, containsJapanese } from './japanese-utils';
import { JLPT_KANJI_READINGS } from './jlpt-data';
import { DictionaryEntry } from './search-engine';
import { createNewSrsItem } from './srs-engine';
import { registerWordInDictionary } from './phonetic-dictionary';

import * as crypto from 'expo-crypto';
import { parseAux, stringifyAux, WordAux } from './word-aux';

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

    if (!dictDb) return [];

    const rawMatches = await dictDb
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

/**
 * Lee, modifica y guarda los datos extra de una palabra.
 * `change` recibe el objeto actual y lo modifica en el lugar. Devuelve el resultado, o null si la palabra no existe.
 */
async function updateWordAux(wordId: string, change: (aux: WordAux) => void): Promise<WordAux | null> {
  const rows = await db.select({ aux: words.auxiliaryInfo }).from(words).where(eq(words.id, wordId)).limit(1);
  if (rows.length === 0) return null;
  const aux = parseAux(rows[0].aux);
  change(aux);
  await db.update(words).set({ auxiliaryInfo: JSON.stringify(aux) }).where(eq(words.id, wordId));
  return aux;
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

  const { level, category, conjugationEnabled } = parseAux(word.auxiliaryInfo);

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
    const auxInfo = stringifyAux({ ...(level && { level }), ...(category && { category }) });

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
  const cleanText = data.simplified.trim();
  let cleanReading = (data.pinyinDisplay || '').trim();

  try {
    const deckRow = await db
      .select({ languageCode: decks.languageCode })
      .from(decks)
      .where(eq(decks.id, deckId))
      .limit(1);
    const lang = deckRow[0]?.languageCode || '';
    const isJapanese = lang.toLowerCase().startsWith('ja') || containsJapanese(cleanText);

    if (isJapanese) {
      if (!cleanReading || cleanReading === cleanText) {
        cleanReading = await resolveJapaneseReading(cleanText);
      }
      if (cleanReading) {
        registerWordInDictionary(cleanText, cleanReading);
      }
    }
  } catch (err) {
    console.warn('[word-service] Error resolving reading for Japanese custom word:', cleanText, err);
  }

  const meaningsJson = data.meanings.startsWith('[') ? data.meanings : JSON.stringify([data.meanings]);
  const auxInfo = stringifyAux({
    ...(data.level && { level: data.level }),
    ...(data.category && { category: data.category }),
    ...(data.conjugationEnabled !== undefined && { conjugationEnabled: data.conjugationEnabled }),
  });

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
  const cleanText = data.text.trim();
  let cleanReading = (data.reading || '').trim();

  try {
    const deckRow = await db
      .select({ languageCode: decks.languageCode })
      .from(decks)
      .where(eq(decks.id, deckId))
      .limit(1);
    const lang = deckRow[0]?.languageCode || '';
    const isJapanese = lang.toLowerCase().startsWith('ja') || containsJapanese(cleanText);

    if (isJapanese) {
      if (!cleanReading || cleanReading === cleanText) {
        cleanReading = await resolveJapaneseReading(cleanText);
      }
      if (cleanReading) {
        registerWordInDictionary(cleanText, cleanReading);
      }
    }
  } catch (err) {
    console.warn('[word-service] Error resolving reading for Japanese word:', cleanText, err);
  }

  const meaningsJson = data.meanings.startsWith('[') ? data.meanings : JSON.stringify([data.meanings]);
  const auxInfo = stringifyAux({
    ...(data.level && { level: data.level }),
    ...(data.category && { category: data.category }),
    ...(data.conjugationEnabled !== undefined && { conjugationEnabled: data.conjugationEnabled }),
  });

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
}

export async function saveCustomCard(
  deckId: string,
  question: string,
  answer: string
): Promise<string> {
  const wordId = generateUUID();
  const cleanQ = question.trim();
  const cleanA = answer.trim();
  const meaningsJson = JSON.stringify([cleanA]);

  await db.insert(words).values({
    id: wordId,
    deckId,
    simplified: cleanQ,
    traditional: cleanQ,
    pinyinDisplay: '',
    pinyinNumeric: '',
    meanings: meaningsJson,
    auxiliaryInfo: null,
    createdAt: new Date(),
  });

  const srsInsert = createNewSrsItem('word', wordId, {
    displayText: cleanQ,
    displayReading: '',
    displayMeaning: meaningsJson,
  });

  await db.insert(srsItems).values(srsInsert);

  return wordId;
}

export async function updateCustomCard(
  cardId: string,
  question: string,
  answer: string
): Promise<void> {
  const cleanQ = question.trim();
  const cleanA = answer.trim();
  const meaningsJson = JSON.stringify([cleanA]);

  await db
    .update(words)
    .set({
      simplified: cleanQ,
      traditional: cleanQ,
      meanings: meaningsJson,
    })
    .where(eq(words.id, cardId));

  await db
    .update(srsItems)
    .set({
      displayText: cleanQ,
      displayMeaning: meaningsJson,
    })
    .where(
      and(
        eq(srsItems.itemType, 'word'),
        eq(srsItems.itemId, cardId)
      )
    );
}

/**
 * Guarda en lote múltiples tarjetas de preguntas y respuestas para un mazo personalizado,
 * deduplicando automáticamente contra preguntas ya existentes en el mazo.
 */
export async function saveBatchCustomCards(
  deckId: string,
  cards: Array<{ question: string; answer: string; reading?: string }>
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  let isJapaneseDeck = false;
  try {
    const deckRow = await db
      .select({ languageCode: decks.languageCode })
      .from(decks)
      .where(eq(decks.id, deckId))
      .limit(1);
    isJapaneseDeck = (deckRow[0]?.languageCode || '').toLowerCase().startsWith('ja');
  } catch {}

  // Obtener preguntas existentes en el mazo para evitar duplicados exactos
  const existingRows = await db
    .select({ simplified: words.simplified })
    .from(words)
    .where(eq(words.deckId, deckId));

  const existingSet = new Set(
    existingRows.map((r) => r.simplified.trim().toLowerCase())
  );

  for (const card of cards) {
    const cleanQ = card.question.trim();
    const cleanA = card.answer.trim();
    if (!cleanQ || !cleanA) continue;

    const key = cleanQ.toLowerCase();
    if (existingSet.has(key)) {
      skipped++;
      continue;
    }

    let finalReading = (card.reading || '').trim();
    if (!finalReading && (isJapaneseDeck || containsJapanese(cleanQ))) {
      finalReading = await resolveJapaneseReading(cleanQ);
    }

    const wordId = generateUUID();
    const meaningsJson = JSON.stringify([cleanA]);

    await db.insert(words).values({
      id: wordId,
      deckId,
      simplified: cleanQ,
      traditional: cleanQ,
      pinyinDisplay: finalReading,
      pinyinNumeric: finalReading.toLowerCase(),
      meanings: meaningsJson,
      auxiliaryInfo: null,
      createdAt: new Date(),
    });

    const srsInsert = createNewSrsItem('word', wordId, {
      displayText: cleanQ,
      displayReading: finalReading,
      displayMeaning: meaningsJson,
    });

    await db.insert(srsItems).values(srsInsert);

    if (finalReading) {
      registerWordInDictionary(cleanQ, finalReading);
    }

    existingSet.add(key);
    inserted++;
  }

  return { inserted, skipped };
}

/**
 * Agrega o reactiva una tarjeta de palabra en el repaso SRS.
 */
export async function addCardToReview(wordId: string): Promise<void> {
  const existing = await db
    .select()
    .from(srsItems)
    .where(
      and(
        eq(srsItems.itemType, 'word'),
        eq(srsItems.itemId, wordId)
      )
    )
    .limit(1);

  if (existing.length > 0) return;

  const w = await db.select().from(words).where(eq(words.id, wordId)).limit(1);
  if (w.length === 0) return;
  const word = w[0];

  const srsInsert = createNewSrsItem('word', wordId, {
    displayText: word.simplified,
    displayReading: word.pinyinDisplay || '',
    displayMeaning: word.meanings || '[]',
  });

  await db.insert(srsItems).values(srsInsert);
}

/**
 * Quita una palabra del repaso SRS (elimina su item SRS pero conserva la palabra en el mazo).
 */
export async function removeCardFromReviewByWordId(wordId: string): Promise<void> {
  await db.delete(srsItems).where(
    and(
      eq(srsItems.itemType, 'word'),
      eq(srsItems.itemId, wordId)
    )
  );
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

  await updateWordAux(wordId, (aux) => {
    aux.selectedMeanings = selectedMeanings;
  });

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
  const deckResult = await db.select().from(decks).where(eq(decks.id, word.deckId)).limit(1);
  const isCustomDeck = deckResult.length > 0 && deckResult[0].type === 'custom';

  let originalList: string[] = [];
  if (isCustomDeck) {
    try {
      const parsed = JSON.parse(word.meanings);
      originalList = Array.isArray(parsed) ? parsed : [String(word.meanings)];
    } catch {
      originalList = [word.meanings];
    }
  } else {
    originalList = cleanAndFormatMeanings(word.meanings);
  }

  const targetClean = meaningToDelete.trim().toLowerCase();

  // Filtrar el significado eliminado sobre la lista
  const newMeaningsList = originalList.filter((m) => m.trim().toLowerCase() !== targetClean);
  const newMeaningsJson = JSON.stringify(newMeaningsList);

  const auxObj = parseAux(word.auxiliaryInfo);
  let newSelected: string[] = Array.isArray(auxObj.selectedMeanings)
    ? auxObj.selectedMeanings.filter((m) => m.trim().toLowerCase() !== targetClean)
    : [];

  if (isCustomDeck || (newSelected.length === 0 && newMeaningsList.length > 0)) {
    newSelected = newMeaningsList;
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
 * Modifica el texto de un significado existente de una palabra,
 * actualizando la lista de significados, la selección para repaso y el ítem SRS asociado.
 */
export async function updateWordMeaningText(
  wordId: string,
  oldMeaning: string,
  newMeaning: string
): Promise<{ updatedMeanings: string[]; updatedSelected: string[] }> {
  const existingWords = await db.select().from(words).where(eq(words.id, wordId)).limit(1);
  if (existingWords.length === 0) {
    return { updatedMeanings: [], updatedSelected: [] };
  }

  const word = existingWords[0];
  const deckResult = await db.select().from(decks).where(eq(decks.id, word.deckId)).limit(1);
  const isCustomDeck = deckResult.length > 0 && deckResult[0].type === 'custom';

  let originalList: string[] = [];
  if (isCustomDeck) {
    try {
      const parsed = JSON.parse(word.meanings);
      originalList = Array.isArray(parsed) ? parsed : [String(word.meanings)];
    } catch {
      originalList = [word.meanings];
    }
  } else {
    originalList = cleanAndFormatMeanings(word.meanings);
  }

  const targetClean = oldMeaning.trim().toLowerCase();
  const trimmedNew = newMeaning.trim();

  if (!trimmedNew) {
    return { updatedMeanings: originalList, updatedSelected: [] };
  }

  // Reemplazar oldMeaning por trimmedNew manteniendo el orden
  const newMeaningsList = originalList.map((m) =>
    m.trim().toLowerCase() === targetClean ? trimmedNew : m
  );
  const newMeaningsJson = JSON.stringify(newMeaningsList);

  const auxObj = parseAux(word.auxiliaryInfo);
  let newSelected: string[] = Array.isArray(auxObj.selectedMeanings)
    ? auxObj.selectedMeanings.map((m) => (m.trim().toLowerCase() === targetClean ? trimmedNew : m))
    : [];

  if (isCustomDeck || (newSelected.length === 0 && newMeaningsList.length > 0)) {
    newSelected = newMeaningsList;
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
    rawExtras?: Record<string, string>;
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
    const auxInfo = stringifyAux({ ...(item.level && { level: item.level.trim() }), ...item.rawExtras });

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

/**
 * Modifica la lectura (pronunciación/furigana) de una palabra existente,
 * actualizando tanto la tabla 'words' como 'srs_items' para que el repaso y el audio
 * reflejen inmediatamente el cambio.
 */
export async function updateWordReading(
  wordId: string,
  newReading: string
): Promise<{ updatedReading: string }> {
  const trimmed = newReading.trim();
  if (!trimmed) {
    return { updatedReading: '' };
  }

  await db.update(words)
    .set({
      pinyinDisplay: trimmed,
      pinyinNumeric: trimmed.toLowerCase(),
    })
    .where(eq(words.id, wordId));

  await db.update(srsItems)
    .set({
      displayReading: trimmed,
    })
    .where(
      and(
        eq(srsItems.itemType, 'word'),
        eq(srsItems.itemId, wordId)
      )
    );

  return { updatedReading: trimmed };
}

export interface ConjugableWord {
  id: string;
  kanji: string;
  reading: string;
  meanings: string[];
  category: string;
  level?: string;
  disabledConjugations?: string[];
  conjugationStreaks?: Record<string, number>;
}

/**
 * Obtiene todas las palabras de un mazo que son verbos o adjetivos en forma de diccionario base
 * (excluyendo formas ya conjugadas o marcadas con conjugationEnabled: false).
 */
export async function getConjugableWordsForDeck(deckId: string): Promise<ConjugableWord[]> {
  const deckWords = await db.select().from(words).where(eq(words.deckId, deckId));
  const results: ConjugableWord[] = [];

  for (const w of deckWords) {
    let category = '';
    let level = '';
    let conjugationEnabled: boolean | undefined = undefined;
    let disabledConjugations: string[] = [];
    let conjugationStreaks: Record<string, number> = {};

    let dictionaryForm: { kanji: string; reading: string } | undefined = undefined;

    const aux = parseAux(w.auxiliaryInfo);
    category = aux.category || '';
    level = aux.level || '';
    if (aux.conjugationEnabled !== undefined) {
      conjugationEnabled = Boolean(aux.conjugationEnabled);
    }
    if (Array.isArray(aux.disabledConjugations)) {
      disabledConjugations = aux.disabledConjugations;
    }
    if (aux.conjugationStreaks && typeof aux.conjugationStreaks === 'object') {
      conjugationStreaks = aux.conjugationStreaks;
    }
    const baseKanji = aux.dictionaryForm?.kanji;
    if (baseKanji && baseKanji.length >= 2 && !/[\u4e00-\u9faf]$/.test(baseKanji) && baseKanji !== 'u') {
      dictionaryForm = aux.dictionaryForm;
    }

    const cleanSimplified = (w.simplified || '').trim();
    const rawKun = aux.kunReading || '';

    // Si termina en kanji pero no tiene dictionaryForm resuelto todavía, intentar auto-resolver
    if (/[\u4e00-\u9faf]$/.test(cleanSimplified) && !dictionaryForm) {
      const resolved = resolveJapaneseBaseForm(cleanSimplified, w.pinyinDisplay || '', rawKun);
      if (resolved) {
        dictionaryForm = { kanji: resolved.baseKanji, reading: resolved.baseReading };
        category = resolved.category;
      } else {
        continue;
      }
    }

    const cleanReading = (w.pinyinDisplay || '').replace(/\s*[\(\[（【][^\)\]）】]*[\)\]）】]/g, '').trim();
    const targetKanji = dictionaryForm ? dictionaryForm.kanji : cleanSimplified;
    const targetReading = dictionaryForm ? (dictionaryForm.reading || cleanReading) : cleanReading;

    // Si no tiene category explícita, o si category era Sustantivo pero tiene dictionaryForm
    if (!category || (dictionaryForm && category === 'Sustantivo')) {
      category = classifyJapaneseWord(targetKanji, targetReading);
    }

    // Excluir si explícitamente se deshabilitó la conjugación o si la categoría resultante es sustantivo/expresión
    if (conjugationEnabled === false || category === 'Sustantivo' || category.includes('Frase')) {
      continue;
    }

    // Comprobar si la palabra está en su forma base de diccionario (Jisho-kei)
    const isBaseForm = dictionaryForm ? true : isJapaneseDictionaryForm(cleanSimplified, cleanReading, category);

    // Solo es conjugable si es forma base y es Verbo/Adjetivo o se habilitó explícitamente
    const isConjugable =
      Boolean(dictionaryForm) ||
      (conjugationEnabled === true && (category.startsWith('Verbo') || category.startsWith('Adjetivo'))) ||
      (conjugationEnabled === undefined && isBaseForm && (category.startsWith('Verbo') || category.startsWith('Adjetivo')));

    if (isConjugable) {
      let parsedMeanings: string[] = [];
      try {
        parsedMeanings = cleanAndFormatMeanings(w.meanings);
      } catch {
        parsedMeanings = [w.simplified];
      }

      results.push({
        id: w.id,
        kanji: targetKanji,
        reading: targetReading,
        meanings: parsedMeanings,
        category,
        level: level || undefined,
        disabledConjugations,
        conjugationStreaks,
      });
    }
  }

  return results;
}

/**
 * Habilita o deshabilita una forma conjugada específica para una palabra.
 */
export async function toggleWordFormConjugation(wordId: string, form: string, disabled: boolean): Promise<void> {
  await updateWordAux(wordId, (aux) => {
    const current = Array.isArray(aux.disabledConjugations) ? aux.disabledConjugations : [];
    aux.disabledConjugations = disabled
      ? Array.from(new Set([...current, form]))
      : current.filter((f) => f !== form);
  });
}

/**
 * Actualiza el flag conjugationEnabled en auxiliaryInfo de una palabra.
 */
export async function setWordConjugationEnabled(wordId: string, enabled: boolean): Promise<void> {
  await updateWordAux(wordId, (aux) => {
    aux.conjugationEnabled = enabled;
  });
}

/**
 * Actualiza la racha de aciertos (streak) para una forma conjugada específica de una palabra.
 * Nivel 0 = 0 aciertos (o fallada) -> pista de terminación
 * Nivel 1 = 1 acierto -> pista con opciones/distractores
 * Nivel 2+ = 2 o más aciertos -> sin pistas
 */
export async function updateWordConjugationStreak(wordId: string, form: string, streak: number): Promise<void> {
  await updateWordAux(wordId, (aux) => {
    const streaks = aux.conjugationStreaks && typeof aux.conjugationStreaks === 'object' ? aux.conjugationStreaks : {};
    aux.conjugationStreaks = { ...streaks, [form]: Math.max(0, streak) };
  });
}

/**
 * Obtiene todas las palabras del mazo que son verbos o adjetivos en forma base de diccionario,
 * pero que actualmente no están incluidas en la práctica de conjugaciones.
 */
export async function getAvailableDeckWordsForConjugation(deckId: string): Promise<ConjugableWord[]> {
  const deckWords = await db.select().from(words).where(eq(words.deckId, deckId));
  const activeConjugables = await getConjugableWordsForDeck(deckId);
  const activeIds = new Set(activeConjugables.map((w) => w.id));

  const results: ConjugableWord[] = [];

  for (const w of deckWords) {
    if (activeIds.has(w.id)) continue;

    const aux = parseAux(w.auxiliaryInfo);
    let category = aux.category || '';
    const level = aux.level || '';

    const cleanReading = (w.pinyinDisplay || '').replace(/\s*[\(\[（【][^\)\]）】]*[\)\]）】]/g, '').trim();
    if (!category) {
      category = classifyJapaneseWord(w.simplified, cleanReading);
    }

    const isBaseForm = isJapaneseDictionaryForm(w.simplified, cleanReading, category);
    const isVerbOrAdj = category.startsWith('Verbo') || category.startsWith('Adjetivo');

    if (isBaseForm && isVerbOrAdj) {
      let parsedMeanings: string[] = [];
      try {
        parsedMeanings = cleanAndFormatMeanings(w.meanings);
      } catch {
        parsedMeanings = [w.simplified];
      }

      results.push({
        id: w.id,
        kanji: w.simplified,
        reading: cleanReading,
        meanings: parsedMeanings,
        category,
        level: level || undefined,
      });
    }
  }

  return results;
}

/**
 * Intenta encontrar la forma diccionario base de una palabra japonesa.
 * Si ya es forma base, la devuelve tal cual.
 * Si es una forma conjugada (ej. 飲んだ, 食べました, 美味しかった, 行かない),
 * utiliza deconjugateJapanese para encontrar el candidato que coincida con la forma base
 * y clasificarla en su categoría correspondiente (Verbo Godan/Ichidan/Irregular o Adjetivo).
 */
export function resolveJapaneseBaseForm(
  word: string,
  reading: string = '',
  rawKun: string = ''
): { baseKanji: string; baseReading: string; category: string } | null {
  const cleanWord = word.trim();
  const cleanReading = (reading || cleanWord).trim();

  // 1. Caso Tarjeta de un solo Kanji (ej. 立, 聞, 行, 見, 食, 飲, 高, 新)
  if (cleanWord.length === 1 && /[\u4e00-\u9faf]/.test(cleanWord)) {
    const jlpt = JLPT_KANJI_READINGS[cleanWord];
    const kunCandidate = jlpt?.kun || rawKun || '';
    const kunParts = kunCandidate.split(/[,、\/]/).map((s) => s.trim());

    for (const part of kunParts) {
      if (part.includes('・') || part.includes('-')) {
        const pieces = part.split(/[・\-]/);
        if (pieces.length === 2 && pieces[0] && pieces[1]) {
          const stem = toNormalizedHiragana(pieces[0]);
          const okuri = toNormalizedHiragana(pieces[1]);
          const fullReading = stem + okuri;
          const baseKanji = cleanWord + okuri;

          if (COMMON_KANA_NOUNS_AND_EXPRESSIONS.has(fullReading)) continue;
          const counters = ['ひとつ', 'ふたつ', 'みっつ', 'よっつ', 'いつつ', 'むっつ', 'ななつ', 'やっつ', 'ここのつ', 'とお'];
          if (counters.includes(fullReading)) continue;

          let category = '';
          if (okuri.endsWith('い')) {
            category = 'Adjetivo -i';
          } else if (fullReading === 'くる' || fullReading === 'する') {
            category = 'Verbo Irregular';
          } else if (okuri.endsWith('る')) {
            const prev = fullReading[fullReading.length - 2];
            const ichidan = [
              'い', 'き', 'し', 'ち', 'に', 'ひ', 'み', 'り', 'ぎ', 'じ', 'ぢ', 'び', 'ぴ',
              'え', 'け', 'せ', 'て', 'ね', 'へ', 'め', 'れ', 'げ', 'ぜ', 'で', 'べ', 'ぺ'
            ];
            category = ichidan.includes(prev) ? 'Verbo Ichidan (-ru)' : 'Verbo Godan (-ru)';
          } else if (/[うくぐすつぬぶむ]/.test(okuri[okuri.length - 1])) {
            category = 'Verbo Godan (-u)';
          }

          if (category) {
            return {
              baseKanji,
              baseReading: fullReading,
              category,
            };
          }
        }
      }
    }
    return null;
  }

  // 2. Si tiene más de 1 kanji y termina en kanji (sustantivo compuesto como 学校, 今日), no es conjugable
  if (cleanWord.length < 2 || /[\u4e00-\u9faf]$/.test(cleanWord)) {
    return null;
  }

  // 1. Verificar si ya es forma de diccionario base
  const directCategory = classifyJapaneseWord(cleanWord, cleanReading);
  if (isJapaneseDictionaryForm(cleanWord, cleanReading, directCategory)) {
    if (directCategory.startsWith('Verbo') || directCategory.startsWith('Adjetivo')) {
      return { baseKanji: cleanWord, baseReading: cleanReading, category: directCategory };
    }
  }

  // 2. Si no es forma base o fue clasificado como Sustantivo por estar conjugado,
  // desconjugar tanto el texto con kanji como la lectura
  const candidatesWord = deconjugateJapanese(cleanWord);
  const candidatesReading = deconjugateJapanese(cleanReading);

  for (const candW of candidatesWord) {
    if (candW === cleanWord || candW.length < 2 || /[\u4e00-\u9faf]$/.test(candW)) continue;
    // Intentar emparejar con un candidato de lectura o hiragana del candidato
    const candR = candidatesReading.find((r) => r !== cleanReading && r.length >= 2) || toNormalizedHiragana(candW);
    if (!candR || candR.length < 2) continue;

    const candCat = classifyJapaneseWord(candW, candR);

    if (
      isJapaneseDictionaryForm(candW, candR, candCat) &&
      (candCat.startsWith('Verbo') || candCat.startsWith('Adjetivo'))
    ) {
      return {
        baseKanji: candW,
        baseReading: candR,
        category: candCat,
      };
    }
  }

  return null;
}

export interface GenerateConjugationsResult {
  totalAnalyzed: number;
  verbsFound: number;
  adjectivesFound: number;
  totalConjugable: number;
  deconjugatedCount: number;
}

/**
 * Analiza todas las palabras de un mazo japonés para detectar verbos y adjetivos
 * (tanto en forma base de diccionario como en formas ya conjugadas de Anki/TSV),
 * reconvirtiéndolos a su forma base de diccionario y habilitando la práctica de conjugaciones.
 */
export async function generateConjugationsForDeck(deckId: string): Promise<GenerateConjugationsResult> {
  const deckWords = await db.select().from(words).where(eq(words.deckId, deckId));
  let verbsFound = 0;
  let adjectivesFound = 0;
  let deconjugatedCount = 0;

  for (const w of deckWords) {
    const rawText = w.simplified || '';
    let rawReading = w.pinyinDisplay || '';

    // Limpieza de etiquetas HTML y sintaxis Anki
    let cleanText = cleanHtmlAndAnkiTags(rawText);
    if (cleanText.includes('[') && cleanText.includes(']')) {
      const parsed = parseAnkiFuriganaSyntax(cleanText);
      cleanText = parsed.text;
      if (!rawReading && parsed.reading) {
        rawReading = parsed.reading;
      }
    }

    let cleanReading = cleanHtmlAndAnkiTags(rawReading)
      .replace(/\[sound:[^\]]+\]/gi, '')
      .trim();

    if (cleanReading.includes('[') && cleanReading.includes(']')) {
      const bracketMatch = cleanReading.match(/\[([^\]]+)\]/);
      if (bracketMatch) {
        cleanReading = bracketMatch[1].trim();
      }
    }

    cleanReading = cleanReading
      .replace(/[\(\[（【][^\)\]）】]*[\)\]）】]/g, '')
      .replace(/[・]/g, '')
      .trim();

    if (!cleanReading && /^[\u3040-\u309f\u30a0-\u30ff]+$/.test(cleanText)) {
      cleanReading = toNormalizedHiragana(cleanText);
    }

    const auxObj = parseAux(w.auxiliaryInfo);
    const rawKun = auxObj.kunReading || '';

    // Resolver la forma base de diccionario (incluso si la tarjeta es un solo kanji o una forma ya conjugada)
    const baseInfo = resolveJapaneseBaseForm(cleanText, cleanReading, rawKun);

    if (baseInfo) {
      const isVerb = baseInfo.category.startsWith('Verbo');
      const isAdj = baseInfo.category.startsWith('Adjetivo');
      if (isVerb) verbsFound++;
      if (isAdj) adjectivesFound++;

      auxObj.category = baseInfo.category;
      auxObj.conjugationEnabled = true;

      // Si la palabra estaba en forma conjugada (ej. 飲んだ -> 飲む)
      if (baseInfo.baseKanji !== cleanText) {
        deconjugatedCount++;
        auxObj.dictionaryForm = {
          kanji: baseInfo.baseKanji,
          reading: baseInfo.baseReading,
        };
      } else {
        delete auxObj.dictionaryForm;
      }

      await db
        .update(words)
        .set({
          simplified: cleanText || w.simplified,
          pinyinDisplay: cleanReading || w.pinyinDisplay,
          pinyinNumeric: (cleanReading || w.pinyinDisplay || '').toLowerCase(),
          auxiliaryInfo: JSON.stringify(auxObj),
        })
        .where(eq(words.id, w.id));
    } else {
      // Si la palabra NO es un verbo ni adjetivo conjugable (ej. sustantivo como 右, 肉, 靴, 夏, 学校):
      // Autocurar cualquier dato corrupto previo (como category = "Verbo Godan (-u)" o dictionaryForm = { kanji: "u" })
      let shouldUpdate = false;
      if (
        auxObj.conjugationEnabled !== undefined ||
        auxObj.dictionaryForm !== undefined ||
        auxObj.category?.startsWith('Verbo') ||
        auxObj.category?.startsWith('Adjetivo -i')
      ) {
        delete auxObj.conjugationEnabled;
        delete auxObj.dictionaryForm;
        auxObj.category = classifyJapaneseWord(cleanText, cleanReading);
        shouldUpdate = true;
      }

      if (shouldUpdate || (cleanReading !== w.pinyinDisplay && cleanReading)) {
        await db
          .update(words)
          .set({
            simplified: cleanText || w.simplified,
            pinyinDisplay: cleanReading || w.pinyinDisplay,
            pinyinNumeric: (cleanReading || w.pinyinDisplay || '').toLowerCase(),
            auxiliaryInfo: JSON.stringify(auxObj),
          })
          .where(eq(words.id, w.id));
      }
    }
  }

  return {
    totalAnalyzed: deckWords.length,
    verbsFound,
    adjectivesFound,
    totalConjugable: verbsFound + adjectivesFound,
    deconjugatedCount,
  };
}

