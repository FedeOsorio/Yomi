import * as crypto from 'expo-crypto';
import { createEmptyCard, fsrs, generatorParameters, Rating, Card, State } from 'ts-fsrs';
import { db } from '../db';
import { srsItems, words, decks } from '../db/schema';
import { eq, lte, and } from 'drizzle-orm';
import { toSearchKey } from './pinyin-utils';
import { toNormalizedHiragana, romajiToHiragana, getEffectiveCardLanguage } from './japanese-utils';

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

  // Desglosar lecturas si expectedReading contiene On'yomi / Kun'yomi (On: ... • Kun: ...)
  const candidateReadings = expectedReading
    .split(/[\/\n,、;•|]/)
    .map((r) =>
      toNormalizedHiragana(
        r.replace(/^(on|kun|音|訓)[:：\s]*/i, '').replace(/[・~～\s\(\)（）\-\.]/g, '')
      )
    )
    .filter((r) => r.length > 0);

  if (hiraUser.length > 0 && candidateReadings.includes(hiraUser)) {
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
  '200': { kana: 'にひゃく', kanji: '二百' },
  '300': { kana: 'さんびゃく', kanji: '三百' },
  '400': { kana: 'よんひゃく', kanji: '四百' },
  '500': { kana: 'ごひゃく', kanji: '五百' },
  '600': { kana: 'ろっぴゃく', kanji: '六百' },
  '700': { kana: 'ななひゃく', kanji: '七百' },
  '800': { kana: 'はっぴゃく', kanji: '八百' },
  '900': { kana: 'きゅうひゃく', kanji: '九百' },
  '1000': { kana: 'せん', kanji: '千' },
  '2000': { kana: 'にせん', kanji: '二千' },
  '3000': { kana: 'さんぜん', kanji: '三千' },
  '4000': { kana: 'よんせん', kanji: '四千' },
  '5000': { kana: 'ごせん', kanji: '五千' },
  '6000': { kana: 'ろくせん', kanji: '六千' },
  '7000': { kana: 'ななせん', kanji: '七千' },
  '8000': { kana: 'はっせん', kanji: '八千' },
  '9000': { kana: 'きゅうせん', kanji: '九千' },
  '10000': { kana: 'いちまん', kanji: '一万' },
  '100000': { kana: 'じゅうまん', kanji: '十万' },
  '1000000': { kana: 'ひゃくまん', kanji: '百万' },
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
  const isJapanese = (lang || '').toLowerCase().startsWith('ja') || /[\u3040-\u30ff]/.test(transcript);
  const isChinese = (lang || '').toLowerCase().startsWith('zh');

  if (isJapanese) {
    if (JA_NUMBERS[trimmed]) {
      return JA_NUMBERS[trimmed].kana;
    }
    // Si contiene letras latinas / hispanas (ej. "ue", "un", "yama", "o-i", "shuu"),
    // convertirlas automáticamente a Hiragana limpio para mostrar siempre kana sin guiones
    if (/[a-zA-Z]/.test(trimmed)) {
      return romajiToHiragana(trimmed);
    }
    // Si contiene chōonpu katakana o guiones (ej. "シュー", "おーい", "お-い")
    if (/[ー\-]/.test(trimmed)) {
      return toNormalizedHiragana(trimmed);
    }
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

  const targetLang = getEffectiveCardLanguage({
    displayText: card.displayText,
    displayReading: card.displayReading,
    auxiliaryInfo: card.auxiliaryInfo,
    languageCode: card.languageCode || lang,
    deckType: card.deckType,
  }).toLowerCase();

  // 3. Si es Japonés
  if (targetLang.startsWith('ja')) {
    // Convertir número arábigo a kana equivalente (ej. "11" → "じゅういち", "1" → "いち")
    const jaNumEntry = JA_NUMBERS[cleanTranscript];
    const effectiveTranscriptKana = jaNumEntry
      ? toNormalizedHiragana(jaNumEntry.kana)
      : toNormalizedHiragana(cleanTranscript);

    // Desglosar múltiples lecturas si displayReading o auxiliaryInfo contiene On'yomi y Kun'yomi (separados por /, ,, 、, ;, •, |, saltos de línea)
    let allReadingsStr = card.displayReading || '';
    if (card.auxiliaryInfo) {
      try {
        const aux = JSON.parse(card.auxiliaryInfo);
        if (aux.kanjiReadings) allReadingsStr += ` • ${aux.kanjiReadings}`;
      } catch {}
    }

    const validReadings = allReadingsStr
      .split(/[\/\n,、;•|]/)
      .map((r) =>
        toNormalizedHiragana(
          r.replace(/^(on|kun|音|訓)[:：\s]*/i, '').replace(/[・~～\s\(\)（）\-\.]/g, '')
        )
      )
      .filter((r) => r.length > 0);

    if (jaNumEntry) {
      // Coincidencia exacta de kanji (ej. "11" → "十一" === "十一")
      if (cleanText === jaNumEntry.kanji) return true;
      const numKana = toNormalizedHiragana(jaNumEntry.kana);
      // Coincidencia exacta de kana con la lectura esperada (ej. "いち" === "いち" o si figura entre las lecturas válidas)
      if (toNormalizedHiragana(cleanReading) === numKana || validReadings.includes(numKana)) return true;
    }

    const readingKana = toNormalizedHiragana(cleanReading);
    const textKana = toNormalizedHiragana(cleanText);

    if (effectiveTranscriptKana.length > 0) {
      // Crear variantes fonéticas para vocales alargadas (ej. "おう" <-> "おお", como en "おおい" vs "おうい")
      const transcriptVariants = [
        effectiveTranscriptKana,
        effectiveTranscriptKana.replace(/おう/g, 'おお'),
        effectiveTranscriptKana.replace(/おお/g, 'おう'),
      ];

      const matchesTarget = (target: string): boolean => {
        if (!target) return false;
        const targetVariants = [
          target,
          target.replace(/おう/g, 'おお'),
          target.replace(/おお/g, 'おう'),
        ];
        return transcriptVariants.some((tv) =>
          targetVariants.some((tg) => tv === tg || tv.includes(tg) || tg.includes(tv))
        );
      };

      // Coincidencia con cualquiera de las lecturas válidas del kanji (on'yomi o kun'yomi)
      if (validReadings.some((r) => matchesTarget(r))) return true;
      if (readingKana.length > 0 && matchesTarget(readingKana)) return true;
      if (textKana.length > 0 && matchesTarget(textKana)) return true;
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
  await healCorruptedSrsIntervals().catch(() => {});
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
 * Formatea el tiempo restante para el próximo repaso de forma precisa y pedagógica:
 * "Disponible ahora", "En 6 horas", "En 12 horas", "Mañana", "En 3 días (17/9/2026)"
 */
export function formatNextReviewTime(due: Date | string | number | null | undefined): string {
  if (!due) return 'Pendiente';
  const dueDate = due instanceof Date ? due : new Date(due);
  const now = new Date();
  const diffMs = dueDate.getTime() - now.getTime();

  if (diffMs <= 0) {
    return 'Disponible ahora';
  }

  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    const mins = Math.max(1, Math.round(diffMs / (1000 * 60)));
    return `En ${mins} min`;
  }

  if (diffHours < 22) {
    const hours = Math.round(diffHours);
    return `En ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) {
    return 'Mañana';
  }

  return `En ${diffDays} días (${dueDate.toLocaleDateString()})`;
}

/**
 * Auto-repara tarjetas del SRS que quedaron programadas a 3+ días en el futuro
 * a pesar de ser tarjetas con dificultad alta (>= 7.0) o fallas recientes.
 * Las reajusta al escalón mínimo (dentro de 4 horas) o disponibles ahora si ya pasaron 4 horas.
 */
export async function healCorruptedSrsIntervals(): Promise<number> {
  const now = new Date();
  const maxAcceptableDue = new Date(now.getTime() + 14 * 60 * 60 * 1000); // 14 horas

  try {
    const items = await db.select().from(srsItems);
    let healedCount = 0;

    for (const item of items) {
      const itemDue = item.due instanceof Date ? item.due : new Date(item.due);
      const isStrugglingOrNew =
        (item.difficulty !== null && item.difficulty !== undefined && item.difficulty >= 7.0) ||
        (item.lapses !== null && item.lapses > 0) ||
        (item.reps !== null && item.reps <= 2);

      if (isStrugglingOrNew && itemDue > maxAcceptableDue) {
        // Asignar al escalón mínimo de 4 horas (o disponible ahora si ya pasaron 4h desde el último repaso)
        const lastRev = item.lastReview ? (item.lastReview instanceof Date ? item.lastReview : new Date(item.lastReview)) : now;
        const targetDue = new Date(Math.max(now.getTime(), lastRev.getTime() + 4 * 60 * 60 * 1000));

        await db
          .update(srsItems)
          .set({
            due: targetDue,
            scheduledDays: 0,
          })
          .where(eq(srsItems.id, item.id));

        healedCount++;
      }
    }

    return healedCount;
  } catch (e) {
    console.warn('Error en healCorruptedSrsIntervals:', e);
    return 0;
  }
}

/**
 * Procesa la calificación de una tarjeta usando el algoritmo FSRS y actualiza la base de datos.
 * Escalones de Repaso:
 * - Escalón 1 (Mínimo): dentro de 4 horas (al fallar o tarjeta nueva).
 * - Escalón 2: dentro de 6 horas.
 * - Escalón 3: dentro de 8 horas.
 * - Escalón 4: dentro de 12 horas.
 * - Escalón 5: dentro de 24 horas (1 día).
 * - Escalón 6 (De ahí para arriba): FSRS exponencial según dificultad y estabilidad (2, 3, 5, 8+ días).
 */
export async function processCardReview(
  cardId: string,
  rating: Rating,
  options?: { wasFailedInSession?: boolean }
): Promise<SrsItem> {
  const currentItems = await db.select().from(srsItems).where(eq(srsItems.id, cardId)).limit(1);

  if (currentItems.length === 0) {
    throw new Error(`SrsItem with id ${cardId} not found`);
  }

  const currentItem = currentItems[0];
  const fsrsCard = toFsrsCard(currentItem);
  const now = new Date();

  // Si la tarjeta ya falló previamente en esta misma sesión y ahora se acierta por repetición inmediata:
  // Se evalúa como Again para el cálculo de estabilidad e intervalo, evitando que salte a días
  const effectiveRating = options?.wasFailedInSession ? Rating.Again : rating;

  const scheduling = getFsrsInstance().repeat(fsrsCard, now);
  const reviewResult = scheduling[effectiveRating as keyof typeof scheduling];
  if (!reviewResult || typeof reviewResult !== 'object' || !('card' in reviewResult)) {
    throw new Error(`Invalid or unsupported review rating: ${effectiveRating}`);
  }
  const updatedCard = reviewResult.card;

  // =========================================================================
  // ESCALONES DE REPASO PEDAGÓGICOS (4h -> 6h -> 8h -> 12h -> 24h -> De ahí para arriba)
  // =========================================================================
  let finalDue: Date;
  let scheduledDays: number;

  const isNewCard = currentItem.reps === 0 || currentItem.state === State.New;
  const lastDue = currentItem.due ? (currentItem.due instanceof Date ? currentItem.due : new Date(currentItem.due)) : now;
  const lastRev = currentItem.lastReview ? (currentItem.lastReview instanceof Date ? currentItem.lastReview : new Date(currentItem.lastReview)) : now;
  const prevIntervalHours = Math.max(0, (lastDue.getTime() - lastRev.getTime()) / (3600 * 1000));
  const prevDays = currentItem.scheduledDays || 0;

  // 1. Si falló (Again) o falló previamente en esta misma sesión:
  // Reinicia de inmediato al escalón mínimo: dentro de 4 horas
  if (effectiveRating === Rating.Again || options?.wasFailedInSession) {
    scheduledDays = 0;
    finalDue = new Date(now.getTime() + 4 * 60 * 60 * 1000); // +4 horas
  }
  // 2. Si es una tarjeta Nueva (primer repaso tras aprenderla):
  // Primer escalón mínimo: dentro de 4 horas para consolidar el primer impacto
  else if (isNewCard) {
    scheduledDays = 0;
    finalDue = new Date(now.getTime() + 4 * 60 * 60 * 1000); // +4 horas
  }
  // 3. Si estaba en el escalón de 4 horas (o menos) y la acertó:
  // Avanza al segundo escalón: dentro de 6 horas
  else if (prevDays === 0 && prevIntervalHours <= 5) {
    scheduledDays = 0;
    finalDue = new Date(now.getTime() + 6 * 60 * 60 * 1000); // +6 horas
  }
  // 4. Si estaba en el escalón de 6 horas y la acertó:
  // Avanza al tercer escalón: dentro de 8 horas
  else if (prevDays === 0 && prevIntervalHours <= 7) {
    scheduledDays = 0;
    finalDue = new Date(now.getTime() + 8 * 60 * 60 * 1000); // +8 horas
  }
  // 5. Si estaba en el escalón de 8 horas y la acertó:
  // Avanza al cuarto escalón: dentro de 12 horas
  else if (prevDays === 0 && prevIntervalHours <= 10) {
    scheduledDays = 0;
    finalDue = new Date(now.getTime() + 12 * 60 * 60 * 1000); // +12 horas
  }
  // 6. Si estaba en el escalón de 12 horas y la acertó:
  // Avanza al quinto escalón: dentro de 24 horas (1 día)
  else if (prevDays === 0 || prevIntervalHours <= 18) {
    scheduledDays = 1;
    finalDue = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24 horas
  }
  // 7. De ahí para arriba (a partir de 24 horas superadas con éxito):
  // El resto se encarga el algoritmo FSRS según dificultad y estabilidad
  else {
    if (prevDays <= 1) {
      // Si superó 24hs, el siguiente salto es a 2 días (si es difícil) o 3 días
      scheduledDays = updatedCard.difficulty >= 7.0 ? 2 : 3;
    } else {
      // Progresión exponencial según la dificultad FSRS
      const factor = updatedCard.difficulty >= 8.0 ? 1.4 : updatedCard.difficulty >= 6.0 ? 1.7 : 2.2;
      scheduledDays = Math.max(prevDays + 1, Math.round(prevDays * factor));
    }
    finalDue = new Date(now.getTime() + scheduledDays * 24 * 60 * 60 * 1000);
  }

  // Contabilizar siempre la repetición para reflejar el esfuerzo real del usuario (Opción A)
  const finalReps = (currentItem.reps || 0) + 1;
  // Solo sumar lapse si fue un fallo real directo, no si fue un acierto por repetición
  const finalLapses = options?.wasFailedInSession
    ? (currentItem.lapses || 0)
    : (rating === Rating.Again ? (currentItem.lapses || 0) + 1 : (currentItem.lapses || 0));

  await db
    .update(srsItems)
    .set({
      state: updatedCard.state,
      due: finalDue,
      stability: updatedCard.stability,
      difficulty: updatedCard.difficulty,
      elapsedDays: updatedCard.elapsed_days,
      scheduledDays: Math.max(0, scheduledDays),
      reps: finalReps,
      lapses: finalLapses,
      lastReview: now,
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
