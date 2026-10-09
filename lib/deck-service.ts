import { db } from '../db';
import { decks, words, srsItems, folders } from '../db/schema';
import * as crypto from 'expo-crypto';
import { eq, and, sql, asc } from 'drizzle-orm';

export interface Folder {
  id: string;
  name: string;
  color?: string | null;
  createdAt: Date;
}

export interface DeckWithStats {
  id: string;
  name: string;
  languageCode: string;
  type: 'language' | 'custom';
  folderId?: string | null;
  createdAt: Date;
  wordCount: number;
  activeCardsCount: number;
  dueCount: number;
}

// Catálogo completo de idiomas soportados para resolución de metadata
export const ALL_LANGUAGES = [
  { code: 'ja-JP', label: 'Japonés', flag: '🇯🇵', placeholder: 'ej. hon, arigato, 本' },
  { code: 'zh-CN', label: 'Chino', flag: '🇨🇳', placeholder: 'Pinyin o Hanzi (ej. ni hao, xuexi, 你好)' },
  { code: 'en-US', label: 'Inglés', flag: '🇺🇸', placeholder: 'ej. serendipity, book' },
  { code: 'es-ES', label: 'Español', flag: '🇪🇸', placeholder: 'ej. efímero, biblioteca' },
  { code: 'fr-FR', label: 'Francés', flag: '🇫🇷', placeholder: 'ej. bonjour, livre' },
  { code: 'de-DE', label: 'Alemán', flag: '🇩🇪', placeholder: 'ej. danke, buch' },
  { code: 'it-IT', label: 'Italiano', flag: '🇮🇹', placeholder: 'ej. ciao, libro' },
  { code: 'ko-KR', label: 'Coreano', flag: '🇰🇷', placeholder: 'ej. annyeong, chaek' },
  { code: 'pt-BR', label: 'Portugués', flag: '🇧🇷', placeholder: 'ej. obrigado, livro' },
  { code: 'ru-RU', label: 'Ruso', flag: '🇷🇺', placeholder: 'ej. privet, kniga' },
];

// Idiomas habilitados para creación de mazos (Japonés, Chino)
export const SUPPORTED_LANGUAGES = ALL_LANGUAGES.filter(
  (lang) => lang.code === 'ja-JP' || lang.code === 'zh-CN'
);

export async function createDeck(
  name: string,
  languageCode: string = 'ja-JP',
  type: 'language' | 'custom' = 'language',
  folderId?: string | null
): Promise<string> {
  const allowed = ['ja-JP', 'zh-CN'];
  const finalLang = type === 'custom' ? (languageCode || 'es-ES') : (allowed.includes(languageCode) ? languageCode : 'ja-JP');
  const id = crypto.randomUUID();
  await db.insert(decks).values({
    id,
    name: name.trim(),
    languageCode: finalLang,
    type,
    folderId: folderId || null,
    createdAt: new Date(),
  });
  return id;
}

export async function getFolders(): Promise<Folder[]> {
  try {
    const result = await db.select().from(folders).orderBy(asc(folders.createdAt));
    return result.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color || null,
      createdAt: f.createdAt,
    }));
  } catch (err) {
    try {
      await db.run(sql`ALTER TABLE folders ADD COLUMN color text;`);
      const result = await db.select().from(folders).orderBy(asc(folders.createdAt));
      return result.map((f) => ({
        id: f.id,
        name: f.name,
        color: f.color || null,
        createdAt: f.createdAt,
      }));
    } catch {
      return [];
    }
  }
}

export async function reorderFolders(folderIds: string[]): Promise<void> {
  const baseTime = Date.now() - folderIds.length * 10000;
  for (let i = 0; i < folderIds.length; i++) {
    await db
      .update(folders)
      .set({ createdAt: new Date(baseTime + i * 1000) })
      .where(eq(folders.id, folderIds[i]));
  }
}

export async function createFolder(name: string, color?: string | null): Promise<string> {
  const id = crypto.randomUUID();
  try {
    await db.insert(folders).values({
      id,
      name: name.trim(),
      color: color || null,
      createdAt: new Date(),
    });
    return id;
  } catch (err: any) {
    console.warn('Error en createFolder, intentando auto-reparar esquema de folders:', err);
    try {
      await db.run(sql`ALTER TABLE folders ADD COLUMN color text;`);
    } catch {}
    await db.insert(folders).values({
      id,
      name: name.trim(),
      color: color || null,
      createdAt: new Date(),
    });
    return id;
  }
}

export async function renameFolder(folderId: string, newName: string, color?: string | null): Promise<void> {
  const updateData: { name: string; color?: string | null } = { name: newName.trim() };
  if (color !== undefined) {
    updateData.color = color;
  }
  try {
    await db
      .update(folders)
      .set(updateData)
      .where(eq(folders.id, folderId));
  } catch (err) {
    try {
      await db.run(sql`ALTER TABLE folders ADD COLUMN color text;`);
    } catch {}
    await db
      .update(folders)
      .set(updateData)
      .where(eq(folders.id, folderId));
  }
}

export async function deleteFolder(folderId: string): Promise<void> {
  // Desvincular mazos que apuntaban a esta carpeta
  await db
    .update(decks)
    .set({ folderId: null })
    .where(eq(decks.folderId, folderId));

  // Eliminar la carpeta
  await db.delete(folders).where(eq(folders.id, folderId));
}

export async function assignDeckToFolder(deckId: string, folderId: string | null): Promise<void> {
  await db
    .update(decks)
    .set({ folderId: folderId || null })
    .where(eq(decks.id, deckId));
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

export async function getDefaultDeckId(): Promise<string> {
  const allDecks = await db.select().from(decks).limit(1);
  if (allDecks.length > 0) {
    return allDecks[0].id;
  }
  
  const id = crypto.randomUUID();
  await db.insert(decks).values({
    id,
    name: 'Mi Vocabulario',
    languageCode: 'ja-JP',
    type: 'language',
    createdAt: new Date(),
  });
  return id;
}

export async function getDecksWithStats(): Promise<DeckWithStats[]> {
  const allDecks = await db.select().from(decks);
  const now = new Date();

  // Consultar todos los ítems SRS de tipo 'word' de una sola vez
  const allSrsCards = await db
    .select({ id: srsItems.id, itemId: srsItems.itemId, due: srsItems.due })
    .from(srsItems)
    .where(eq(srsItems.itemType, 'word'));

  const srsMap = new Map<string, { due: Date }>();
  for (const s of allSrsCards) {
    srsMap.set(s.itemId, { due: new Date(s.due) });
  }

  const results: DeckWithStats[] = [];

  for (const deck of allDecks) {
    const deckWords = await db
      .select({ id: words.id })
      .from(words)
      .where(eq(words.deckId, deck.id));

    let dueCount = 0;
    let activeCardsCount = 0;

    for (const w of deckWords) {
      const srs = srsMap.get(w.id);
      if (srs) {
        activeCardsCount++;
        if (srs.due <= now) {
          dueCount++;
        }
      }
    }

    results.push({
      id: deck.id,
      name: deck.name,
      languageCode: deck.languageCode,
      type: (deck.type as 'language' | 'custom') || 'language',
      folderId: deck.folderId || null,
      createdAt: deck.createdAt,
      wordCount: deckWords.length,
      activeCardsCount,
      dueCount,
    });
  }

  return results;
}
