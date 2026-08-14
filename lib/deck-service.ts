import { db } from '../db';
import { decks, words, srsItems } from '../db/schema';
import * as crypto from 'expo-crypto';
import { eq, lte, and } from 'drizzle-orm';

export interface DeckWithStats {
  id: string;
  name: string;
  languageCode: string;
  createdAt: Date;
  wordCount: number;
  dueCount: number;
}

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: 'Chino', flag: '🇨🇳', placeholder: 'ej. xihuan, ni hao' },
  { code: 'ja-JP', label: 'Japonés', flag: '🇯🇵', placeholder: 'ej. hon, arigato, 本' },
  { code: 'en-US', label: 'Inglés', flag: '🇺🇸', placeholder: 'ej. serendipity, book' },
  { code: 'es-ES', label: 'Español', flag: '🇪🇸', placeholder: 'ej. efímero, biblioteca' },
  { code: 'fr-FR', label: 'Francés', flag: '🇫🇷', placeholder: 'ej. bonjour, livre' },
  { code: 'de-DE', label: 'Alemán', flag: '🇩🇪', placeholder: 'ej. danke, buch' },
  { code: 'it-IT', label: 'Italiano', flag: '🇮🇹', placeholder: 'ej. ciao, libro' },
  { code: 'ko-KR', label: 'Coreano', flag: '🇰🇷', placeholder: 'ej. annyeong, chaek' },
  { code: 'pt-BR', label: 'Portugués', flag: '🇧🇷', placeholder: 'ej. obrigado, livro' },
  { code: 'ru-RU', label: 'Ruso', flag: '🇷🇺', placeholder: 'ej. privet, kniga' },
];

export async function createDeck(name: string, languageCode: string = 'zh-CN'): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(decks).values({
    id,
    name: name.trim(),
    languageCode,
    createdAt: new Date(),
  });
  return id;
}

export async function deleteDeck(deckId: string): Promise<void> {
  // Obtener palabras del mazo para borrar tarjetas SRS
  const deckWords = await db.select({ id: words.id }).from(words).where(eq(words.deckId, deckId));
  for (const w of deckWords) {
    await db.delete(srsItems).where(
      and(eq(srsItems.itemType, 'word'), eq(srsItems.itemId, w.id))
    );
  }
  // Borrar palabras
  await db.delete(words).where(eq(words.deckId, deckId));
  // Borrar mazo
  await db.delete(decks).where(eq(decks.id, deckId));
}

export async function getDeckById(deckId: string) {
  const result = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getDefaultDeckId(): Promise<string> {
  const allDecks = await db.select().from(decks).limit(1);
  if (allDecks.length > 0) {
    return allDecks[0].id;
  }
  
  const id = crypto.randomUUID();
  await db.insert(decks).values({
    id,
    name: 'Mi Vocabulario',
    languageCode: 'zh-CN',
    createdAt: new Date(),
  });
  return id;
}

export async function getDecks() {
  return await db.select().from(decks);
}

export async function getDecksWithStats(): Promise<DeckWithStats[]> {
  const allDecks = await db.select().from(decks);
  const now = new Date();

  const results: DeckWithStats[] = [];

  for (const deck of allDecks) {
    const deckWords = await db
      .select({ id: words.id })
      .from(words)
      .where(eq(words.deckId, deck.id));

    const wordIds = deckWords.map(w => w.id);
    let dueCount = 0;

    if (wordIds.length > 0) {
      const dueCards = await db
        .select({ id: srsItems.id, itemId: srsItems.itemId })
        .from(srsItems)
        .where(
          and(
            eq(srsItems.itemType, 'word'),
            lte(srsItems.due, now)
          )
        );

      dueCount = dueCards.filter(c => wordIds.includes(c.itemId)).length;
    }

    results.push({
      id: deck.id,
      name: deck.name,
      languageCode: deck.languageCode,
      createdAt: deck.createdAt,
      wordCount: deckWords.length,
      dueCount,
    });
  }

  return results;
}
