import { db } from '../db';
import { words, srsItems, decks } from '../db/schema';
import { dictionaryEntries } from '../db/dict-schema';
import { DictionaryEntry } from './search-engine';
import { searchJapanese } from './japanese-search';
import * as crypto from 'expo-crypto';
import { createNewSrsItem } from './srs-engine';
import { and, eq, like, ne, sql } from 'drizzle-orm';

export interface CompoundWord {
  id: string;
  simplified: string;
  traditional?: string;
  pinyinDisplay: string;
  meanings: string[];
}

export interface WordDetailWithRelations {
  word: typeof words.$inferSelect;
  deck: typeof decks.$inferSelect | null;
  srsItem: typeof srsItems.$inferSelect | null;
  meaningsList: string[];
  compoundWords: CompoundWord[];
  level?: string;
}

/**
 * Busca 2 a 3 palabras compuestas comunes en el diccionario local de SQLite que contengan el carácter dado.
 */
export async function getCompoundWordsForChar(
  char: string,
  limit: number = 3
): Promise<CompoundWord[]> {
  if (!char || !char.trim()) return [];

  const trimmedChar = char.trim();

  // Si la palabra contiene varios caracteres, tomamos el primer ideograma representativo
  const searchChar = trimmedChar.length > 0 ? trimmedChar[0] : trimmedChar;

  try {
    const rawMatches = await db
      .select()
      .from(dictionaryEntries)
      .where(
        and(
          like(dictionaryEntries.simplified, `%${searchChar}%`),
          ne(dictionaryEntries.simplified, trimmedChar)
        )
      )
      .limit(limit * 3);

    const filtered = rawMatches
      .filter((entry) => entry.simplified.length >= 2 && entry.simplified.length <= 4)
      .slice(0, limit);

    return filtered.map((entry) => {
      let parsedMeanings: string[] = [];
      try {
        parsedMeanings = JSON.parse(entry.meanings);
      } catch {
        parsedMeanings = [entry.meanings];
      }
      return {
        id: entry.id,
        simplified: entry.simplified,
        traditional: entry.traditional,
        pinyinDisplay: entry.pinyinDisplay,
        meanings: parsedMeanings,
      };
    });
  } catch (error) {
    console.warn('Error al buscar palabras compuestas:', error);
    return [];
  }
}

/**
 * Obtiene el detalle completo de una palabra, incluyendo su mazo, estado FSRS, nivel oficial y palabras compuestas asociadas.
 * Si la palabra no tenía nivel guardado, lo resuelve automáticamente y lo persiste.
 */
export async function getWordDetailWithRelations(
  wordId: string
): Promise<WordDetailWithRelations | null> {
  const wordResults = await db
    .select()
    .from(words)
    .where(eq(words.id, wordId))
    .limit(1);

  if (wordResults.length === 0) {
    return null;
  }

  const word = wordResults[0];

  const deckResults = await db
    .select()
    .from(decks)
    .where(eq(decks.id, word.deckId))
    .limit(1);
  const deck = deckResults.length > 0 ? deckResults[0] : null;

  const srsResults = await db
    .select()
    .from(srsItems)
    .where(and(eq(srsItems.itemType, 'word'), eq(srsItems.itemId, word.id)))
    .limit(1);
  const srsItem = srsResults.length > 0 ? srsResults[0] : null;

  let meaningsList: string[] = [];
  try {
    meaningsList = JSON.parse(word.meanings);
  } catch {
    meaningsList = [word.meanings];
  }

  let level: string | undefined = undefined;
  if (word.auxiliaryInfo) {
    try {
      const parsedAux = JSON.parse(word.auxiliaryInfo);
      level = parsedAux.level;
    } catch {}
  }

  // Auto-backfill: Si no tiene nivel y es Japonés, consultamos y persistimos
  if (!level && deck?.languageCode === 'ja-JP') {
    try {
      const jaMatches = await searchJapanese(word.simplified);
      const match = jaMatches.find(m => m.kanji === word.simplified || m.reading === word.simplified);
      if (match && match.level) {
        level = match.level;
        await db
          .update(words)
          .set({ auxiliaryInfo: JSON.stringify({ level }) })
          .where(eq(words.id, word.id));
      }
    } catch {}
  }

  const isIdeographic = !deck || deck.languageCode.startsWith('zh') || deck.languageCode.startsWith('ja');
  const compoundWords = isIdeographic
    ? await getCompoundWordsForChar(word.simplified, 3)
    : [];

  return {
    word,
    deck,
    srsItem,
    meaningsList,
    compoundWords,
    level,
  };
}

export async function saveWords(deckId: string, selectedEntries: DictionaryEntry[], level?: string): Promise<void> {
  for (const entry of selectedEntries) {
    const existing = await db
      .select()
      .from(words)
      .where(
        and(
          eq(words.deckId, deckId),
          eq(words.simplified, entry.simplified),
          eq(words.pinyinNumeric, entry.pinyinNumeric)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      continue;
    }

    const wordId = crypto.randomUUID();
    const auxInfo = level ? JSON.stringify({ level }) : null;

    await db.insert(words).values({
      id: wordId,
      deckId,
      simplified: entry.simplified,
      traditional: entry.traditional,
      pinyinDisplay: entry.pinyinDisplay,
      pinyinNumeric: entry.pinyinNumeric,
      meanings: entry.meanings,
      auxiliaryInfo: auxInfo,
      createdAt: new Date(),
    });

    const srsInsert = createNewSrsItem('word', wordId, {
      displayText: entry.simplified,
      displayReading: entry.pinyinDisplay,
      displayMeaning: entry.meanings,
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
  }
): Promise<void> {
  const wordId = crypto.randomUUID();
  const meaningsJson = data.meanings.startsWith('[') ? data.meanings : JSON.stringify([data.meanings]);
  const auxInfo = data.level ? JSON.stringify({ level: data.level }) : null;

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

/**
 * Guarda una palabra en cualquier idioma en el mazo especificado, con soporte para metadatos como JLPT o HSK.
 */
export async function saveGenericWord(
  deckId: string,
  data: {
    text: string;
    reading?: string;
    meanings: string;
    level?: string;
  }
): Promise<void> {
  const wordId = crypto.randomUUID();
  const meaningsJson = data.meanings.startsWith('[') ? data.meanings : JSON.stringify([data.meanings]);
  const auxInfo = data.level ? JSON.stringify({ level: data.level }) : null;

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
