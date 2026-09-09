import * as crypto from 'expo-crypto';
import { createEmptyCard, fsrs, generatorParameters, Rating, Card, State } from 'ts-fsrs';
import { db } from '../db';
import { srsItems, words, decks } from '../db/schema';
import { eq, lte, and } from 'drizzle-orm';
import { toSearchKey } from './pinyin-utils';
import { toNormalizedHiragana } from './japanese-utils';

// Inicializar motor FSRS con intervalos diarios (sin pasos de minutos intra-día)
let _fsrsInstance: ReturnType<typeof fsrs> | null = null;
function getFsrsInstance() {
  if (!_fsrsInstance) {
    _fsrsInstance = fsrs(
      generatorParameters({
        enable_fuzz: false,
        enable_short_term: false,
      })
    );
  }
  return _fsrsInstance;
}

export type SrsItem = typeof srsItems.$inferSelect;

export interface DueCardWithContext extends SrsItem {
  deckId?: string | null;
  languageCode?: string | null;
  deckType?: 'language' | 'custom' | null;
  auxiliaryInfo?: string | null;
  wordMeanings?: string | null;
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

  const cleanExpected = expectedReading.trim().toLowerCase();
  const cleanUser = userInput.trim().toLowerCase();
  if (!cleanExpected || !cleanUser) return false;

  // 1. Coincidencia exacta directa
  if (cleanExpected === cleanUser) return true;

  // 2. Normalización de Pinyin (Chino)
  const normalizedExpected = normalizeReading(expectedReading);
  const normalizedUser = normalizeReading(userInput);

  if (normalizedExpected.length > 0 && normalizedUser.length > 0) {
    if (normalizedExpected === normalizedUser) return true;
    if (normalizedExpected.replace(/[0-9]/g, '') === normalizedUser.replace(/[0-9]/g, '')) return true;
  }

  // 3. Normalización a Hiragana (Japonés: Romaji, Katakana, Hiragana)
  const hiraExpected = toNormalizedHiragana(expectedReading);
  const hiraUser = toNormalizedHiragana(userInput);

  if (hiraExpected.length > 0 && hiraUser.length > 0 && hiraExpected === hiraUser) {
    return true;
  }

  // 4. Comparación sin espacios
  const noSpaceExpected = cleanExpected.replace(/\s+/g, '');
  const noSpaceUser = cleanUser.replace(/\s+/g, '');
  if (noSpaceExpected.length > 0 && noSpaceExpected === noSpaceUser) return true;

  return false;
}

export const JA_NUMBERS: Record<string, { kana: string; kanji: string }> = {
  '0': { kana: 'れい', kanji: '零' },
  '1': { kana: 'いち', kanji: '一' },
  '2': { kana: 'に', kanji: '二' },
  '3': { kana: 'さん', kanji: '三' },
  '4': { kana: 'よん', kanji: '四' },
  '5': { kana: 'ご', kanji: '五' },
  '6': { kana: 'ろく', kanji: '六' },
  '7': { kana: 'なな', kanji: '七' },
  '8': { kana: 'はち', kanji: '八' },
  '9': { kana: 'きゅう', kanji: '九' },
  '10': { kana: 'じゅう', kanji: '十' },
  '11': { kana: 'じゅういち', kanji: '十一' },
  '12': { kana: 'じゅうに', kanji: '十二' },
  '13': { kana: 'じゅうさん', kanji: '十三' },
  '14': { kana: 'じゅうよん', kanji: '十四' },
  '15': { kana: 'じゅうご', kanji: '十五' },
  '16': { kana: 'じゅうろく', kanji: '十六' },
  '17': { kana: 'じゅうなな', kanji: '十七' },
  '18': { kana: 'じゅうはち', kanji: '十八' },
  '19': { kana: 'じゅうきゅう', kanji: '十九' },
  '20': { kana: 'にじゅう', kanji: '二十' },
  '30': { kana: 'さんじゅう', kanji: '三十' },
  '40': { kana: 'よんじゅう', kanji: '四十' },
  '50': { kana: 'ごじゅう', kanji: '五十' },
  '100': { kana: 'ひゃく', kanji: '百' },
};


export const ZH_NUMBERS: Record<string, { pinyin: string; hanzi: string }> = {
  '0': { pinyin: 'ling2', hanzi: '零' },
  '1': { pinyin: 'yi1', hanzi: '一' },
  '2': { pinyin: 'er4', hanzi: '二' },
  '3': { pinyin: 'san1', hanzi: '三' },
  '4': { pinyin: 'si4', hanzi: '四' },
  '5': { pinyin: 'wu3', hanzi: '五' },
  '6': { pinyin: 'liu4', hanzi: '六' },
  '7': { pinyin: 'qi1', hanzi: '七' },
  '8': { pinyin: 'ba1', hanzi: '八' },
  '9': { pinyin: 'jiu3', hanzi: '九' },
  '10': { pinyin: 'shi2', hanzi: '十' },
};

/**
 * Da formato legible a la transcripción de voz si el motor transcribió números arábigos
 * (ej. si dijo "ichi" y Google transcribió "1", se formatea a "いち").
 */
export function formatSpokenTranscript(transcript: string, lang: string): string {
  if (!transcript) return '';
  const trimmed = transcript.trim();
  const isJapanese = (lang || '').toLowerCase().startsWith('ja');
  const isChinese = (lang || '').toLowerCase().startsWith('zh');

  if (isJapanese && JA_NUMBERS[trimmed]) {
    return JA_NUMBERS[trimmed].kana;
  }
  if (isChinese && ZH_NUMBERS[trimmed]) {
    return ZH_NUMBERS[trimmed].hanzi;
  }
  return transcript;
}

/**
 * Valida de forma estricta si la pronunciación por voz reconocida coincide con la tarjeta.
 */
export function checkVoiceMatch(
  card: DueCardWithContext,
  transcript: string,
  lang: string
): boolean {
  if (!transcript || !transcript.trim()) return false;

  // Limpiar signos de puntuación y espacios agregados por motores de voz
  const cleanTranscript = transcript
    .replace(/[。、！？!?,.:;\s]/g, '')
    .trim()
    .toLowerCase();

  const cleanText = card.displayText
    .replace(/[。、！？!?,.:;\s]/g, '')
    .trim()
    .toLowerCase();

  const cleanReading = card.displayReading
    .replace(/[。、！？!?,.:;\s]/g, '')
    .trim()
    .toLowerCase();

  if (!cleanTranscript) return false;

  // 1. Coincidencia directa con el carácter/palabra (muy común cuando Google Speech transcribe Kanji o Hanzi)
  if (cleanText.length > 0 && (cleanTranscript === cleanText || cleanTranscript.includes(cleanText))) return true;

  // 2. Coincidencia directa con la lectura
  if (cleanReading.length > 0 && (cleanTranscript === cleanReading || cleanTranscript.includes(cleanReading))) return true;

  const targetLang = (card.languageCode || lang || '').toLowerCase();

  // 3. Si es Japonés
  if (targetLang.startsWith('ja')) {
    // Convertir número arábigo a kana equivalente (ej. "11" → "じゅういち", "1" → "いち")
    const jaNumEntry = JA_NUMBERS[cleanTranscript];
    const effectiveTranscriptKana = jaNumEntry
      ? toNormalizedHiragana(jaNumEntry.kana)
      : toNormalizedHiragana(cleanTranscript);

    if (jaNumEntry) {
      // Coincidencia exacta de kanji (ej. "11" → "十一" === "十一")
      if (cleanText === jaNumEntry.kanji) return true;
      // Coincidencia exacta de kana con la lectura esperada (ej. "いち" === "いち")
      if (toNormalizedHiragana(cleanReading) === toNormalizedHiragana(jaNumEntry.kana)) return true;
    }

    const readingKana = toNormalizedHiragana(cleanReading);
    const textKana = toNormalizedHiragana(cleanText);

    if (effectiveTranscriptKana.length > 0) {
      if (readingKana.length > 0 && (effectiveTranscriptKana === readingKana || effectiveTranscriptKana.includes(readingKana))) return true;
      if (textKana.length > 0 && (effectiveTranscriptKana === textKana || effectiveTranscriptKana.includes(textKana))) return true;
    }
    return false;
  }

  // 4. Si es Chino
  if (targetLang.startsWith('zh')) {
    if (ZH_NUMBERS[cleanTranscript]) {
      const zhNum = ZH_NUMBERS[cleanTranscript];
      if (cleanText === zhNum.hanzi) return true;
      if (normalizeReading(cleanReading) === normalizeReading(zhNum.pinyin)) return true;
    }

    const pinyinTranscript = normalizeReading(cleanTranscript);
    const pinyinExpected = normalizeReading(cleanReading);

    if (pinyinTranscript.length > 0 && pinyinExpected.length > 0) {
      if (pinyinTranscript === pinyinExpected) return true;
      if (pinyinTranscript.replace(/[0-9]/g, '') === pinyinExpected.replace(/[0-9]/g, '')) return true;
    }
    return false;
  }

  // 5. Idiomas alfabéticos (Inglés, Español, etc.)
  const normTranscript = normalizeText(cleanTranscript);
  const normText = normalizeText(cleanText);
  if (normTranscript.length > 0 && normText.length > 0 && normTranscript === normText) {
    return true;
  }

  return false;
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
    due: item.due instanceof Date ? item.due : new Date(item.due),
    stability: item.stability,
    difficulty: item.difficulty,
    elapsed_days: item.elapsedDays,
    scheduled_days: item.scheduledDays,
    reps: item.reps,
    lapses: item.lapses,
    state: item.state as State,
    last_review: item.lastReview ? (item.lastReview instanceof Date ? item.lastReview : new Date(item.lastReview)) : undefined,
    learning_steps: 0,
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
      deckType: decks.type,
      auxiliaryInfo: words.auxiliaryInfo,
      wordMeanings: words.meanings,
    })
    .from(srsItems)
    .innerJoin(words, eq(srsItems.itemId, words.id))
    .leftJoin(decks, eq(words.deckId, decks.id));

  if (deckId && deckId !== 'all') {
    return await query.where(and(lte(srsItems.due, now), eq(words.deckId, deckId)));
  }

  return await query.where(lte(srsItems.due, now));
}

/**
 * Obtiene todas las tarjetas de un mazo para Práctica Libre (sin filtrar por fecha due).
 */
export async function getAllCardsForPractice(deckId?: string): Promise<DueCardWithContext[]> {
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
      deckType: decks.type,
      auxiliaryInfo: words.auxiliaryInfo,
      wordMeanings: words.meanings,
    })
    .from(srsItems)
    .innerJoin(words, eq(srsItems.itemId, words.id))
    .leftJoin(decks, eq(words.deckId, decks.id));

  if (deckId && deckId !== 'all') {
    return await query.where(eq(words.deckId, deckId));
  }

  return await query;
}

/**
 * Pospone la tarjeta 1 día en el SRS (opción "Otro día" para mazos personalizados).
 */
export async function rescheduleCardNextDay(cardId: string): Promise<void> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(4, 0, 0, 0);
  const minTomorrow = new Date(Date.now() + 12 * 60 * 60 * 1000);
  const effectiveDue = tomorrow.getTime() > minTomorrow.getTime() ? tomorrow : minTomorrow;

  await db
    .update(srsItems)
    .set({
      due: effectiveDue,
      lastReview: new Date(),
    })
    .where(eq(srsItems.id, cardId));
}

/**
 * Elimina la tarjeta del ciclo de repaso SRS (opción "Nunca" para mazos personalizados).
 */
export async function removeCardFromReview(cardId: string): Promise<void> {
  await db.delete(srsItems).where(eq(srsItems.id, cardId));
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

  const scheduling = getFsrsInstance().repeat(fsrsCard, now);
  const reviewResult = scheduling[rating as keyof typeof scheduling];
  if (!reviewResult || typeof reviewResult !== 'object' || !('card' in reviewResult)) {
    throw new Error(`Invalid or unsupported review rating: ${rating}`);
  }
  const updatedCard = reviewResult.card;

  // Garantizar que la fecha 'due' quede programada para el día siguiente (o según estabilidad FSRS)
  // evitando que una tarjeta repasada hoy vuelva a vencer en minutos durante el mismo día
  let finalDue = updatedCard.due;
  if (finalDue <= now) {
    finalDue = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }

  await db
    .update(srsItems)
    .set({
      state: updatedCard.state,
      due: finalDue,
      stability: updatedCard.stability,
      difficulty: updatedCard.difficulty,
      elapsedDays: updatedCard.elapsed_days,
      scheduledDays: Math.max(1, updatedCard.scheduled_days),
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
