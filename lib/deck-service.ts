import { db } from '../db';
import { decks, words, srsItems, folders } from '../db/schema';
import * as crypto from 'expo-crypto';
import { eq, and, sql, asc, isNull, inArray } from 'drizzle-orm';
import { canMoveFolder } from './folder-tree';
import type { AnkiNoteType } from './anki-template';
import { cleanOrphanMedia } from './data-repair';

export interface Folder {
  id: string;
  name: string;
  color?: string | null;
  /** Carpeta que la contiene (null = Inicio). */
  parentId: string | null;
  position: number;
  createdAt: Date;
}

export interface DeckWithWordCount {
  id: string;
  name: string;
  languageCode: string;
  type: 'language' | 'custom';
  folderId?: string | null;
  createdAt: Date;
  wordCount: number;
}

export interface DeckWithStats extends DeckWithWordCount {
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

/** De qué `.apkg` vino la media de un mazo (para pedirle al usuario ese archivo al recuperarla). */
export interface DeckMediaSource {
  file: string;
  mediaCount: number;
  importedAt: string;
}

/** Mazos de idioma: qué se responde en el repaso. null = la lectura (lo de siempre). */
export type DeckAnswerMode = 'reading' | 'meaning';

export async function getDeckAnswerMode(deckId: string): Promise<DeckAnswerMode> {
  const rows = await db.select({ mode: decks.answerMode }).from(decks).where(eq(decks.id, deckId)).limit(1);
  return rows[0]?.mode === 'meaning' ? 'meaning' : 'reading';
}

export async function setDeckAnswerMode(deckId: string, mode: DeckAnswerMode): Promise<void> {
  await db.update(decks).set({ answerMode: mode }).where(eq(decks.id, deckId));
}

export async function setDeckMediaSource(deckId: string, source: DeckMediaSource): Promise<void> {
  await db.update(decks).set({ mediaSource: JSON.stringify(source) }).where(eq(decks.id, deckId));
}

/** Diseño de un mazo importado de Anki: con esto sus tarjetas se dibujan como en Anki (anki-template). */
export interface AnkiDeckDesign {
  /** Tipos de nota por id (plantillas, CSS, campos) */
  noteTypes: Record<string, AnkiNoteType>;
  /** Archivos que pide el diseño (CSS importado, imágenes), nombre original -> ruta en disco ("media/…") */
  files: Record<string, string>;
  /**
   * Idioma del contenido ("ja-JP", "zh-CN"…), detectado al importar: elige la forma de kanji/hanzi.
   * Un mazo personalizado puede tener contenido en japonés aunque el mazo no sea "de idiomas".
   */
  language?: string;
}

const designCache = new Map<string, AnkiDeckDesign | null>();

/**
 * Agrega el diseño de un .apkg al del mazo. Un mazo puede recibir varios .apkg: se conservan los tipos de
 * nota y archivos que ya tenía (si un tipo de nota vuelve a venir, queda la versión nueva).
 */
export async function addDeckAnkiDesign(deckId: string, design: AnkiDeckDesign): Promise<void> {
  const current = await getDeckAnkiDesign(deckId);
  const merged: AnkiDeckDesign = {
    noteTypes: { ...current?.noteTypes, ...design.noteTypes },
    files: { ...current?.files, ...design.files },
    language: design.language ?? current?.language,
  };
  await db.update(decks).set({ ankiNoteTypes: JSON.stringify(merged) }).where(eq(decks.id, deckId));
  designCache.set(deckId, merged);
}

/** Después de restaurar un backup el diseño guardado puede ser otro: se vuelve a leer de la base. */
export function clearDeckAnkiDesignCache(): void {
  designCache.clear();
}

/** Diseño del mazo (en memoria después de la primera lectura). null si el mazo no viene de Anki. */
export async function getDeckAnkiDesign(deckId: string): Promise<AnkiDeckDesign | null> {
  if (designCache.has(deckId)) return designCache.get(deckId)!;
  const rows = await db.select({ design: decks.ankiNoteTypes }).from(decks).where(eq(decks.id, deckId)).limit(1);
  let design: AnkiDeckDesign | null = null;
  try {
    design = rows[0]?.design ? (JSON.parse(rows[0].design) as AnkiDeckDesign) : null;
  } catch {}
  designCache.set(deckId, design);
  return design;
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
  designCache.delete(deckId);
  // Tres sentencias en una transacción (antes era una consulta por tarjeta: miles en un mazo grande)
  const deckWordIds = db.select({ id: words.id }).from(words).where(eq(words.deckId, deckId));
  await db.$client.withTransactionAsync(async () => {
    await db.delete(srsItems).where(and(eq(srsItems.itemType, 'word'), inArray(srsItems.itemId, deckWordIds)));
    await db.delete(words).where(eq(words.deckId, deckId));
    await db.delete(decks).where(eq(decks.id, deckId));
  });

  // Limpiar archivos multimedia huérfanos que pertenecían a las palabras eliminadas
  cleanOrphanMedia().catch((err) => {
    console.warn('[deckService.deleteDeck] Error limpiando media huérfana:', err);
  });
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

/**
 * Consulta ultrarrápida para pantallas que solo necesitan el listado de mazos y su conteo de palabras
 * (Inicio/Home, Carpetas, Selector en Búsqueda, etc.). Utiliza un index-only scan sobre idx_words_deck
 * sin tocar srs_items ni realizar joins complejos con COUNT(DISTINCT).
 */
export async function getDecksWithWordCount(): Promise<DeckWithWordCount[]> {
  const allDecks = await db.select().from(decks);
  const wordCounts = await db
    .select({
      deckId: words.deckId,
      wordCount: sql<number>`count(*)`,
    })
    .from(words)
    .groupBy(words.deckId);
  const countsByDeck = new Map(wordCounts.map((c) => [c.deckId, Number(c.wordCount)]));

  return allDecks.map((deck) => ({
    id: deck.id,
    name: deck.name,
    languageCode: deck.languageCode,
    type: (deck.type as 'language' | 'custom') || 'language',
    folderId: deck.folderId || null,
    createdAt: deck.createdAt,
    wordCount: countsByDeck.get(deck.id) ?? 0,
  }));
}

/**
 * Consulta completa con estadísticas de repaso (activeCardsCount y dueCount).
 * Optimizada para separar el conteo de palabras del conteo de SRS, evitando un LEFT JOIN
 * masivo con COUNT(DISTINCT) que degradaba el rendimiento con miles de tarjetas.
 */
export async function getDecksWithStats(): Promise<DeckWithStats[]> {
  const allDecks = await db.select().from(decks);
  const nowSeconds = Math.floor(Date.now() / 1000);

  // 1. Conteo directo de palabras por mazo (index-only scan rápido)
  const wordCounts = await db
    .select({
      deckId: words.deckId,
      wordCount: sql<number>`count(*)`,
    })
    .from(words)
    .groupBy(words.deckId);
  const wordCountsByDeck = new Map(wordCounts.map((c) => [c.deckId, Number(c.wordCount)]));

  // 2. Conteo de tarjetas SRS activas y pendientes (solo sobre srsItems asociados a palabras)
  const srsCounts = await db
    .select({
      deckId: words.deckId,
      activeCardsCount: sql<number>`count(*)`,
      dueCount: sql<number>`count(case when ${srsItems.due} <= ${nowSeconds} then 1 end)`,
    })
    .from(srsItems)
    .innerJoin(words, eq(srsItems.itemId, words.id))
    .where(eq(srsItems.itemType, 'word'))
    .groupBy(words.deckId);
  const srsCountsByDeck = new Map(srsCounts.map((c) => [c.deckId, c]));

  return allDecks.map((deck) => {
    const srs = srsCountsByDeck.get(deck.id);
    return {
      id: deck.id,
      name: deck.name,
      languageCode: deck.languageCode,
      type: (deck.type as 'language' | 'custom') || 'language',
      folderId: deck.folderId || null,
      createdAt: deck.createdAt,
      wordCount: wordCountsByDeck.get(deck.id) ?? 0,
      activeCardsCount: Number(srs?.activeCardsCount ?? 0),
      dueCount: Number(srs?.dueCount ?? 0),
    };
  });
}
