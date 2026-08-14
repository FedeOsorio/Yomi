import * as crypto from 'expo-crypto';
import { createEmptyCard, fsrs, generatorParameters, Rating, Card, State } from 'ts-fsrs';
import { db } from '../db';
import { srsItems, words, decks } from '../db/schema';
import { eq, lte, and } from 'drizzle-orm';
import { toSearchKey } from './pinyin-utils';

// Inicializar motor FSRS
const f = fsrs(generatorParameters({ enable_fuzz: false }));

export type SrsItem = typeof srsItems.$inferSelect;

export interface DueCardWithContext extends SrsItem {
  deckId?: string;
  languageCode?: string;
}

/**
 * Normaliza una cadena de texto para comparación flexible de significados.
 */
export function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos diacríticos
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’]/g, '') // Remover puntuación
    .trim();
}

/**
 * Normaliza una lectura fonética (pinyin/romaji).
 */
export function normalizeReading(reading: string): string {
  if (!reading) return '';
  return toSearchKey(reading).replace(/[^a-z0-9]/g, '');
}

/**
 * Valida si la lectura ingresada por el usuario coincide con la esperada.
 */
export function checkReadingMatch(expectedReading: string, userInput: string): boolean {
  if (!expectedReading || !userInput) return false;
  const normalizedExpected = normalizeReading(expectedReading);
  const normalizedUser = normalizeReading(userInput);

  if (normalizedExpected === normalizedUser) return true;
  return normalizedExpected.replace(/[0-9]/g, '') === normalizedUser.replace(/[0-9]/g, '');
}

/**
 * Valida si el significado ingresado por el usuario coincide con alguno de los significados de la tarjeta.
 */
export function checkMeaningMatch(expectedMeaningsJsonOrStr: string, userInput: string): boolean {
  if (!expectedMeaningsJsonOrStr || !userInput) return false;

  let meanings: string[] = [];
  try {
    meanings = JSON.parse(expectedMeaningsJsonOrStr);
  } catch {
    meanings = [expectedMeaningsJsonOrStr];
  }

  const userClean = normalizeText(userInput);
  if (!userClean) return false;

  for (const m of meanings) {
    const targetClean = normalizeText(m);
    // Coincidencia exacta o si contiene la palabra clave
    if (targetClean === userClean) return true;
    if (targetClean.includes(userClean) && userClean.length >= 3) return true;
    if (userClean.includes(targetClean) && targetClean.length >= 3) return true;

    // Comparar palabras individuales
    const targetWords = targetClean.split(/\s+/);
    const userWords = userClean.split(/\s+/);
    const hasCommonWord = userWords.some(w => w.length >= 3 && targetWords.includes(w));
    if (hasCommonWord) return true;
  }

  return false;
}

/**
 * Calcula la calificación FSRS según la precisión de las respuestas del usuario.
 */
export function calculateReviewRating(
  isReadingCorrect: boolean,
  isMeaningCorrect: boolean,
  isIdeographic: boolean
): Rating {
  if (isIdeographic) {
    if (isReadingCorrect && isMeaningCorrect) {
      return Rating.Good;
    } else if (isReadingCorrect || isMeaningCorrect) {
      return Rating.Hard;
    } else {
      return Rating.Again;
    }
  } else {
    // Para idiomas alfabéticos solo se evalúa significado/producción
    return isMeaningCorrect ? Rating.Good : Rating.Again;
  }
}

/**
 * Crea una nueva tarjeta SRS inicial en estado 'New' usando FSRS.
 */
export function createNewSrsItem(
  itemType: 'word' | 'sentence',
  itemId: string,
  displayData: {
    displayText: string;
    displayReading: string;
    displayMeaning: string;
  }
) {
  const card = createEmptyCard();

  return {
    id: crypto.randomUUID(),
    itemType,
    itemId,
    ...displayData,
    state: card.state,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.last_review || null,
    createdAt: new Date(),
  };
}

/**
 * Reconstruye el objeto Card de ts-fsrs a partir del registro de la base de datos.
 */
function toFsrsCard(item: SrsItem): Card {
  return {
    due: item.due,
    stability: item.stability,
    difficulty: item.difficulty,
    elapsed_days: item.elapsedDays,
    scheduled_days: item.scheduledDays,
    reps: item.reps,
    lapses: item.lapses,
    state: item.state as State,
    last_review: item.lastReview || undefined,
  };
}

/**
 * Obtiene todas las tarjetas pendientes de repaso para hoy (due <= ahora).
 */
export async function getDueCards(deckId?: string): Promise<DueCardWithContext[]> {
  const now = new Date();

  const query = db
    .select({
      id: srsItems.id,
      itemType: srsItems.itemType,
      itemId: srsItems.itemId,
      displayText: srsItems.displayText,
      displayReading: srsItems.displayReading,
      displayMeaning: srsItems.displayMeaning,
      state: srsItems.state,
      due: srsItems.due,
      stability: srsItems.stability,
      difficulty: srsItems.difficulty,
      elapsedDays: srsItems.elapsedDays,
      scheduledDays: srsItems.scheduledDays,
      reps: srsItems.reps,
      lapses: srsItems.lapses,
      lastReview: srsItems.lastReview,
      createdAt: srsItems.createdAt,
      deckId: words.deckId,
      languageCode: decks.languageCode,
    })
    .from(srsItems)
    .leftJoin(words, eq(srsItems.itemId, words.id))
    .leftJoin(decks, eq(words.deckId, decks.id))
    .where(lte(srsItems.due, now));

  const results = await query;
  return results.filter(item => !deckId || item.deckId === deckId);
}

/**
 * Procesa la calificación de una tarjeta usando el algoritmo FSRS y actualiza la base de datos.
 */
export async function processCardReview(cardId: string, rating: Rating): Promise<SrsItem> {
  const currentItems = await db.select().from(srsItems).where(eq(srsItems.id, cardId)).limit(1);

  if (currentItems.length === 0) {
    throw new Error(`SrsItem with id ${cardId} not found`);
  }

  const currentItem = currentItems[0];
  const fsrsCard = toFsrsCard(currentItem);
  const now = new Date();

  const scheduling = f.repeat(fsrsCard, now);
  const updatedCard = scheduling[rating].card;

  await db
    .update(srsItems)
    .set({
      state: updatedCard.state,
      due: updatedCard.due,
      stability: updatedCard.stability,
      difficulty: updatedCard.difficulty,
      elapsedDays: updatedCard.elapsed_days,
      scheduledDays: updatedCard.scheduled_days,
      reps: updatedCard.reps,
      lapses: updatedCard.lapses,
      lastReview: updatedCard.last_review || now,
    })
    .where(eq(srsItems.id, cardId));

  const updatedRecords = await db.select().from(srsItems).where(eq(srsItems.id, cardId)).limit(1);
  return updatedRecords[0];
}

/**
 * Obtiene métricas generales de estudio.
 */
export async function getStudyStats(deckId?: string): Promise<{
  totalCards: number;
  dueCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
}> {
  const allCards = await getDueCards(deckId);
  const total = await db.select().from(srsItems);

  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;

  allCards.forEach(c => {
    if (c.state === State.New) newCount++;
    else if (c.state === State.Learning || c.state === State.Relearning) learningCount++;
    else if (c.state === State.Review) reviewCount++;
  });

  return {
    totalCards: total.length,
    dueCards: allCards.length,
    newCards: newCount,
    learningCards: learningCount,
    reviewCards: reviewCount,
  };
}
