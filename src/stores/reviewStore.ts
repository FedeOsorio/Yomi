import { create } from 'zustand';
import { Rating } from 'ts-fsrs';
import { db } from '../../db';
import { decks, words } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { DeckWithStats, getDecksWithStats } from '../../lib/deck-service';
import { PinyinBreakdownItem } from '../../lib/pinyin-utils';
import {
  DueCardWithContext,
  getDueCards,
  getAllCardsForPractice,
  healCorruptedSrsIntervals,
} from '../../lib/srs-engine';
import { CompoundWord } from '../../lib/word-service';

export interface CardEvaluation {
  isReadingCorrect: boolean;
  isMeaningCorrect: boolean;
  computedRating: Rating;
  voiceScore?: { score: number; label: string; breakdown?: PinyinBreakdownItem[] };
  matchedReading?: string;
}

export type SpeechStatus = 'idle' | 'listening' | 'evaluating' | 'correct' | 'incorrect';
export type StudyMethod = 'text' | 'voice';

export interface ReviewState {
  // Mazos y navegación
  decksList: DeckWithStats[];
  selectedDeckId: string | null;
  selectedDeckName: string;
  studyMethod: StudyMethod;
  isPracticeMode: boolean;
  showMethodModal: boolean;
  pendingSelection: {
    deckId: string | 'all';
    deckName: string;
    hasDue: boolean;
  } | null;

  // Sesión activa
  dueCards: DueCardWithContext[];
  currentIndex: number;
  loading: boolean;
  isProcessing: boolean;
  sessionCompleted: boolean;
  sessionCount: number;

  // Rastreo interno de tarjetas en la sesión actual
  sessionFailedCardIds: Set<string>;
  sessionProcessedCardIds: Set<string>;

  // Entrada e interacción de la tarjeta
  inputReading: string;
  inputMeaning: string;
  isChecked: boolean;
  evaluation: CardEvaluation | null;
  currentCompoundWords: CompoundWord[];

  // Reconocimiento de voz
  isListening: boolean;
  speechTranscript: string;
  speechStatus: SpeechStatus;

  // Getters / Selectores
  getCurrentCard: () => DueCardWithContext | null;

  // Acciones
  fetchDecksData: () => Promise<void>;
  promptStudyMethod: (deckId: string | 'all', deckName: string, hasDue: boolean) => void;
  setShowMethodModal: (show: boolean) => void;
  startSession: (
    deckId: string | 'all',
    deckName: string,
    method?: StudyMethod,
    practiceMode?: boolean
  ) => Promise<void>;
  exitSession: () => void;
  setInputReading: (val: string) => void;
  setInputMeaning: (val: string) => void;
  setIsChecked: (val: boolean) => void;
  setEvaluation: (evalData: CardEvaluation | null) => void;
  setCurrentCompoundWords: (compounds: CompoundWord[]) => void;
  setIsListening: (val: boolean) => void;
  setSpeechTranscript: (val: string) => void;
  setSpeechStatus: (val: SpeechStatus) => void;
  setIsProcessing: (val: boolean) => void;
  recordFailedCard: (cardId: string) => void;
  recordProcessedCard: (cardId: string) => void;
  resetCurrentCardForm: () => void;
  advanceCard: (incrementCount?: boolean) => boolean;
  reinsertCurrentCardAhead: (offsetMin?: number, offsetMax?: number) => void;
  reinsertCurrentCardAtEnd: () => void;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  // Estados iniciales
  decksList: [],
  selectedDeckId: null,
  selectedDeckName: '',
  studyMethod: 'text',
  isPracticeMode: false,
  showMethodModal: false,
  pendingSelection: null,

  dueCards: [],
  currentIndex: 0,
  loading: false,
  isProcessing: false,
  sessionCompleted: false,
  sessionCount: 0,

  sessionFailedCardIds: new Set<string>(),
  sessionProcessedCardIds: new Set<string>(),

  inputReading: '',
  inputMeaning: '',
  isChecked: false,
  evaluation: null,
  currentCompoundWords: [],

  isListening: false,
  speechTranscript: '',
  speechStatus: 'idle',

  getCurrentCard: () => {
    const { dueCards, currentIndex } = get();
    return dueCards[currentIndex] || null;
  },

  fetchDecksData: async () => {
    set({ loading: true });
    try {
      await healCorruptedSrsIntervals().catch(() => {});

      const d = await getDecksWithStats();
      // Auto-reparar mazos japoneses creados con 'zh-CN' por defecto en versiones anteriores
      for (const deck of d) {
        if (deck.languageCode === 'zh-CN') {
          const sampleWords = await db
            .select()
            .from(words)
            .where(eq(words.deckId, deck.id))
            .limit(5);
          const isJapanese = sampleWords.some(
            (w) =>
              /[\u3040-\u30ff]/.test(w.pinyinDisplay || '') ||
              /[\u3040-\u30ff]/.test(w.simplified || '') ||
              /[\u3040-\u30ff]/.test(w.auxiliaryInfo || '')
          );
          if (isJapanese) {
            await db.update(decks).set({ languageCode: 'ja-JP' }).where(eq(decks.id, deck.id));
            deck.languageCode = 'ja-JP';
          }
        }
      }
      set({ decksList: d.filter((deck) => deck.activeCardsCount > 0) });
    } catch (e) {
      console.warn('Error al cargar mazos con stats en reviewStore:', e);
    } finally {
      set({ loading: false });
    }
  },

  promptStudyMethod: (deckId, deckName, hasDue) => {
    const targetDeck = get().decksList.find((d) => d.id === deckId);
    if (targetDeck?.type === 'custom') {
      get().startSession(deckId, deckName, 'text', !hasDue);
      return;
    }
    set({
      pendingSelection: { deckId, deckName, hasDue },
      showMethodModal: true,
    });
  },

  setShowMethodModal: (show) => set({ showMethodModal: show }),

  startSession: async (deckId, deckName, method = 'text', practiceMode = false) => {
    set({
      loading: true,
      selectedDeckId: deckId,
      selectedDeckName: deckName,
      studyMethod: method,
      isPracticeMode: practiceMode,
      sessionCompleted: false,
      sessionCount: 0,
      currentIndex: 0,
      sessionFailedCardIds: new Set<string>(),
      sessionProcessedCardIds: new Set<string>(),
      inputReading: '',
      inputMeaning: '',
      isChecked: false,
      evaluation: null,
      currentCompoundWords: [],
      speechTranscript: '',
      speechStatus: 'idle',
      isListening: false,
      isProcessing: false,
    });

    try {
      let cards: DueCardWithContext[] = [];
      cards = practiceMode
        ? await getAllCardsForPractice(deckId === 'all' ? undefined : deckId)
        : await getDueCards(deckId === 'all' ? undefined : deckId);

      // Mezclar aleatoriamente (Fisher-Yates)
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }

      set({ dueCards: cards });
    } catch (e) {
      console.warn('Error al cargar tarjetas de sesión en reviewStore:', e);
      set({ dueCards: [] });
    } finally {
      set({ loading: false });
    }
  },

  exitSession: () => {
    set({
      selectedDeckId: null,
      selectedDeckName: '',
      sessionCompleted: false,
      dueCards: [],
      currentIndex: 0,
      inputReading: '',
      inputMeaning: '',
      isChecked: false,
      evaluation: null,
      currentCompoundWords: [],
      isListening: false,
      speechTranscript: '',
      speechStatus: 'idle',
      isProcessing: false,
    });
  },

  setInputReading: (val) => set({ inputReading: val }),
  setInputMeaning: (val) => set({ inputMeaning: val }),
  setIsChecked: (val) => set({ isChecked: val }),
  setEvaluation: (evalData) => set({ evaluation: evalData }),
  setCurrentCompoundWords: (compounds) => set({ currentCompoundWords: compounds }),
  setIsListening: (val) => set({ isListening: val }),
  setSpeechTranscript: (val) => set({ speechTranscript: val }),
  setSpeechStatus: (val) => set({ speechStatus: val }),
  setIsProcessing: (val) => set({ isProcessing: val }),

  recordFailedCard: (cardId) => {
    const nextFailed = new Set(get().sessionFailedCardIds);
    nextFailed.add(cardId);
    set({ sessionFailedCardIds: nextFailed });
  },

  recordProcessedCard: (cardId) => {
    const nextProcessed = new Set(get().sessionProcessedCardIds);
    nextProcessed.add(cardId);
    set({ sessionProcessedCardIds: nextProcessed });
  },

  resetCurrentCardForm: () => {
    set({
      inputReading: '',
      inputMeaning: '',
      isChecked: false,
      evaluation: null,
      speechTranscript: '',
      speechStatus: 'idle',
      currentCompoundWords: [],
    });
  },

  advanceCard: (incrementCount = true) => {
    const { currentIndex, dueCards, sessionCount } = get();
    const nextIndex = currentIndex + 1;
    const nextCount = incrementCount ? sessionCount + 1 : sessionCount;
    if (nextIndex < dueCards.length) {
      set({
        currentIndex: nextIndex,
        sessionCount: nextCount,
        inputReading: '',
        inputMeaning: '',
        isChecked: false,
        evaluation: null,
        speechTranscript: '',
        speechStatus: 'idle',
        currentCompoundWords: [],
        isProcessing: false,
      });
      return true;
    } else {
      set({
        sessionCompleted: true,
        sessionCount: nextCount,
        isProcessing: false,
      });
      return false;
    }
  },

  reinsertCurrentCardAhead: (offsetMin = 5, offsetMax = 10) => {
    const { dueCards, currentIndex } = get();
    const currentCard = dueCards[currentIndex];
    if (!currentCard) return;

    const updated = [...dueCards];
    const remainingCount = updated.length - (currentIndex + 1);

    if (remainingCount <= 0 || remainingCount <= 5) {
      updated.push(currentCard);
    } else {
      const minOffset = Math.min(offsetMin, remainingCount);
      const maxOffset = Math.min(offsetMax, remainingCount);
      const offset = Math.floor(Math.random() * (maxOffset - minOffset + 1)) + minOffset;
      const targetPos = currentIndex + 1 + offset;
      updated.splice(targetPos, 0, currentCard);
    }

    set({ dueCards: updated });
  },

  reinsertCurrentCardAtEnd: () => {
    const { dueCards, currentIndex } = get();
    const currentCard = dueCards[currentIndex];
    if (!currentCard) return;
    set({ dueCards: [...dueCards, currentCard] });
  },
}));
