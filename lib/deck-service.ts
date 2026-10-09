import { db } from '../db';
import { decks, words, srsItems, folders } from '../db/schema';
import * as crypto from 'expo-crypto';
import { eq, and, sql, asc, isNull } from 'drizzle-orm';
import { canMoveFolder } from './folder-tree';

export interface Folder {
  id: string;
  name: string;
  color?: string | null;
  /** Carpeta que la contiene (null = Inicio). */
  parentId: string | null;
  position: number;
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

/** Todas las carpetas, ordenadas entre hermanas. Una carpeta cuyo padre ya no existe se muestra en Inicio. */
export async function getFolders(): Promise<Folder[]> {
  const rows = await db.select().from(folders).orderBy(asc(folders.position), asc(folders.createdAt));
  const ids = new Set(rows.map((f) => f.id));
  const result: Folder[] = rows.map((f) => ({
    id: f.id,
    name: f.name,
    color: f.color || null,
    parentId: f.parentId && ids.has(f.parentId) ? f.parentId : null,
    position: f.position,
    createdAt: f.createdAt,
  }));
  // Un ciclo (A dentro de B y B dentro de A, p. ej. tras combinar un respaldo) dejaría carpetas
  // inalcanzables: se corta mostrando en Inicio la carpeta donde se cierra el ciclo.
  const byId = new Map(result.map((f) => [f.id, f]));
  for (const folder of result) {
    const seen = new Set<string>([folder.id]);
    let parent = folder.parentId ? byId.get(folder.parentId) : undefined;
    while (parent) {
      if (seen.has(parent.id)) {
        folder.parentId = null;
        break;
      }
      seen.add(parent.id);
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
  }
  return result;
}

/** Guarda el orden de un grupo de carpetas hermanas. */
export async function reorderFolders(folderIds: string[]): Promise<void> {
  for (let i = 0; i < folderIds.length; i++) {
    await db.update(folders).set({ position: i }).where(eq(folders.id, folderIds[i]));
  }
}

/** Posición para una carpeta nueva: al final de sus hermanas. */
async function nextPosition(parentId: string | null): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${folders.position})` })
    .from(folders)
    .where(parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId));
  return (row?.max ?? -1) + 1;
}

export async function createFolder(name: string, color?: string | null, parentId: string | null = null): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(folders).values({
    id,
    name: name.trim(),
    color: color || null,
    parentId,
    position: await nextPosition(parentId),
    createdAt: new Date(),
  });
  return id;
}

export async function renameFolder(folderId: string, newName: string, color?: string | null): Promise<void> {
  await db
    .update(folders)
    .set({ name: newName.trim(), ...(color !== undefined ? { color } : {}) })
    .where(eq(folders.id, folderId));
}

/** Mueve una carpeta (con todo su contenido) dentro de otra, o a Inicio con null. */
export async function moveFolder(folderId: string, newParentId: string | null): Promise<void> {
  if (!canMoveFolder(await getFolders(), folderId, newParentId)) {
    throw new Error('No se puede mover una carpeta dentro de sí misma');
  }
  await db
    .update(folders)
    .set({ parentId: newParentId, position: await nextPosition(newParentId) })
    .where(eq(folders.id, folderId));
}

/** Elimina la carpeta. Sus mazos y subcarpetas no se borran: pasan a la carpeta que la contenía. */
export async function deleteFolder(folderId: string): Promise<void> {
  const [folder] = await db.select().from(folders).where(eq(folders.id, folderId)).limit(1);
  const parentId = folder?.parentId ?? null;
  await db.update(decks).set({ folderId: parentId }).where(eq(decks.folderId, folderId));
  await db.update(folders).set({ parentId }).where(eq(folders.parentId, folderId));
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
