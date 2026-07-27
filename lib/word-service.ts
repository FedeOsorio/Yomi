import { db } from '../db';
import { words, srsItems } from '../db/schema';
import { DictionaryEntry } from './search-engine';
import * as crypto from 'expo-crypto';
import { createNewSrsItem } from './srs-engine';
import { and, eq } from 'drizzle-orm';

export async function saveWords(deckId: string, selectedEntries: DictionaryEntry[]): Promise<void> {
  for (const entry of selectedEntries) {
    // Evitar duplicados: verificamos si ya existe esta misma palabra en este mazo
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
    
    await db.insert(words).values({
      id: wordId,
      deckId,
      simplified: entry.simplified,
      traditional: entry.traditional,
      pinyinDisplay: entry.pinyinDisplay,
      pinyinNumeric: entry.pinyinNumeric,
      meanings: entry.meanings,
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
