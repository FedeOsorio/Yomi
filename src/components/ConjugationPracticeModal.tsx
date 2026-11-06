import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { preloadAudioService, speakText, stopSpeech } from '../../lib/audio-service';
import { equivalentConjugations } from '../../lib/japanese-conjugation';
import { parseFurigana } from '../../lib/japanese-search';
import {
  conjugateJapanese,
  JapaneseConjugationForm,
  romajiToHiragana,
  romajiToHiraganaAsYouType,
} from '../../lib/japanese-utils';
import {
  initialPracticeFlow,
  micLooksOn,
  PRACTICE_ANSWER_MS,
  PracticeEffect,
  PracticeEvent,
  PracticeFlowState,
  stepPracticeFlow,
} from '../../lib/practice-flow';
import { MODEL_NOT_DOWNLOADED } from '../../lib/sherpa-service';
import { speechService } from '../../lib/speech-recognition-service';
import { matchesConjugationAnswer } from '../../lib/voice-match';
import { VoiceModelRequiredModal } from './review/VoiceModelRequiredModal';
import {
  ConjugableWord,
  getAvailableDeckWordsForConjugation,
  getConjugableWordsForDeck,
  setWordConjugationEnabled,
  toggleWordFormConjugation,
  updateWordConjugationStreak,
} from '../../lib/word-service';
import { useTheme } from '../../providers/ThemeProvider';
import { Shadows, Spacing } from '../constants/theme';
import { useTranslation } from '../i18n';
import { useSingleNavigation } from '../hooks/useSingleNavigation';

/** Mantener apretado el micrófono: la barra empieza a llenarse a los 200 ms y tarda 550 ms más. */
const HOLD_DELAY_MS = 200;
const HOLD_FILL_MS = 550;

interface ConjugationPracticeModalProps {
  visible: boolean;
  onClose: () => void;
  deckId: string;
  deckName: string;
}

export type ConjugationFilterForm = JapaneseConjugationForm | 'all';

export interface PracticeQueueItem {
  word: ConjugableWord;
  form: JapaneseConjugationForm;
}

export interface FormPromptDetails {
  badge: string;
  title: string;
  hint: string;
  explanation: string;
}

export const FORM_OPTIONS: Array<{ key: ConjugationFilterForm; label: string; suffix: string }> = [
  { key: 'all', label: 'Aleatorio (Todas)', suffix: '' },
  { key: 'te', label: 'Forma -te', suffix: '' },
  { key: 'nakute', label: 'Forma -te negativa', suffix: '' },
  { key: 'ta', label: 'Pasado informal', suffix: '' },
  { key: 'nai', label: 'Negativo informal', suffix: '' },
  { key: 'nakatta', label: 'Pasado neg. informal', suffix: '' },
  { key: 'adverbial', label: 'Forma adverbial', suffix: '' },
  { key: 'masu', label: 'Presente formal', suffix: '' },
  { key: 'mashita', label: 'Pasado formal', suffix: '' },
  { key: 'masen', label: 'Negativo formal', suffix: '' },
  { key: 'mashou', label: 'Forma -mashou', suffix: '' },
];

export const FORM_LABELS: Record<JapaneseConjugationForm, string> = {
  te: 'Forma -te',
  nakute: 'Forma -te negativa',
  ta: 'Pasado informal',
  nai: 'Negativo informal',
  nakatta: 'Pasado negativo informal',
  adverbial: 'Forma adverbial',
  masu: 'Presente formal',
  mashita: 'Pasado formal',
  masen: 'Negativo formal',
  mashou: 'Forma -mashou',
};

export function getFormOptions(t: (key: string) => string): Array<{ key: ConjugationFilterForm; label: string; suffix: string }> {
  return [
    { key: 'all', label: t('conjugation.allForms'), suffix: '' },
    { key: 'te', label: t('conjugation.formTe'), suffix: '' },
    { key: 'nakute', label: t('conjugation.formNakute'), suffix: '' },
    { key: 'ta', label: t('conjugation.formTa'), suffix: '' },
    { key: 'nai', label: t('conjugation.formNai'), suffix: '' },
    { key: 'nakatta', label: t('conjugation.formNakatta'), suffix: '' },
    { key: 'adverbial', label: t('conjugation.formAdverbial'), suffix: '' },
    { key: 'masu', label: t('conjugation.formMasu'), suffix: '' },
    { key: 'mashita', label: t('conjugation.formMashita'), suffix: '' },
    { key: 'masen', label: t('conjugation.formMasen'), suffix: '' },
    { key: 'mashou', label: t('conjugation.formMashou'), suffix: '' },
  ];
}

export function getFormLabel(form: JapaneseConjugationForm, t: (key: string) => string): string {
  switch (form) {
    case 'te': return t('conjugation.formTe');
    case 'nakute': return t('conjugation.formNakute');
    case 'ta': return t('conjugation.formTa');
    case 'nai': return t('conjugation.formNai');
    case 'nakatta': return t('conjugation.formNakatta');
    case 'adverbial': return t('conjugation.formAdverbial');
    case 'masu': return t('conjugation.formMasu');
    case 'mashita': return t('conjugation.formMashita');
    case 'masen': return t('conjugation.formMasen');
    case 'mashou': return t('conjugation.formMashou');
    default: return form;
  }
}

/**
 * Obtiene la terminación o sufijo real esperado (Streak 0) para guiar al usuario.
 * Ej: hanasu (はなす) -> hanashite (はなして) da "-して".
 */
export function getConjugationSuffix(baseReading: string, conjugatedReading: string): string {
  if (!baseReading || !conjugatedReading) return '';
  let i = 0;
  while (i < baseReading.length && i < conjugatedReading.length && baseReading[i] === conjugatedReading[i]) {
    i++;
  }
  const remainder = conjugatedReading.slice(i);
  return remainder ? `-${remainder}` : `-${conjugatedReading}`;
}

/**
 * Obtiene el abanico de posibilidades/distractores de una forma (Streak 1).
 * Fuerza al usuario a recordar la regla de transformación.
 */
export function getFormDistractors(form?: JapaneseConjugationForm): string {
  if (!form) return '';
  switch (form) {
    case 'te':
      return '-って / -んで / -して / -いて / -て';
    case 'ta':
      return '-った / -んだ / -した / -いた / -た';
    case 'nai':
      return '-かない / -がない / -さない / -たない / -まない / -らない / -わない / -ない';
    case 'nakatta':
      return '-なかった / -かなかった / -さなかった / -たなかった / -まなかった';
    case 'nakute':
      return '-なくて / -かなくて / -さなくて / -たなくて / -まなくて';
    case 'masu':
      return '-ます / -きます / -します / -ちます / -にます / -みます / -ります';
    case 'mashita':
      return '-ました / -きました / -しました / -ちました / -みました / -りました';
    case 'masen':
      return '-ません / -きません / -しません / -ちません / -みません / -りません';
    case 'mashou':
      return '-ましょう / -きましょう / -しましょう / -ちましょう / -みましょう / -りましょう';
    case 'adverbial':
      return '-く / -に';
    default:
      return '';
  }
}

export function getPromptDetailsForForm(
  word?: ConjugableWord,
  form?: JapaneseConjugationForm
): FormPromptDetails {
  if (!form) {
    return {
      badge: 'FORMA CONECTIVA',
      title: 'Forma -te',
      hint: '',
      explanation: 'Para conectar acciones consecutivas o peticiones.',
    };
  }

  switch (form) {
    case 'ta':
      return {
        badge: 'PASADO INFORMAL',
        title: 'Pasado informal',
        hint: '',
        explanation: 'Acción pasada en lenguaje informal.',
      };
    case 'nai':
      return {
        badge: 'NEGATIVO INFORMAL',
        title: 'Negativo informal',
        hint: '',
        explanation: 'Negación en presente para lenguaje informal.',
      };
    case 'nakatta':
      return {
        badge: 'PASADO NEGATIVO INFORMAL',
        title: 'Pasado negativo informal',
        hint: '',
        explanation: 'Acción que no ocurrió, en lenguaje informal.',
      };
    case 'masu':
      return {
        badge: 'PRESENTE FORMAL',
        title: 'Presente formal',
        hint: '',
        explanation: 'Presente o futuro en lenguaje formal.',
      };
    case 'mashita':
      return {
        badge: 'PASADO FORMAL',
        title: 'Pasado formal',
        hint: '',
        explanation: 'Acción pasada en lenguaje formal.',
      };
    case 'masen':
      return {
        badge: 'NEGATIVO FORMAL',
        title: 'Negativo formal',
        hint: '',
        explanation: 'Negación en presente, en lenguaje formal.',
      };
    case 'mashou':
      return {
        badge: 'INVITACIÓN / PROPUESTA',
        title: 'Forma -mashou',
        hint: '',
        explanation: 'Expresa invitación o propuesta conjunta ("vamos a...").',
      };
    case 'te':
      return {
        badge: 'FORMA CONECTIVA',
        title: 'Forma -te',
        hint: '',
        explanation: 'Conecta dos o más acciones en una misma oración.',
      };
    case 'nakute':
      return {
        badge: 'FORMA CONECTIVA NEGATIVA',
        title: 'Forma -te negativa',
        hint: '',
        explanation: 'Conecta acciones en negativo.',
      };
    case 'adverbial':
      return {
        badge: 'FORMA ADVERBIAL',
        title: 'Forma adverbial',
        hint: '',
        explanation: 'Convierte en adverbio para modificar al verbo.',
      };
    default:
      return {
        badge: 'FORMA -TE',
        title: 'Forma -te',
        hint: '',
        explanation: 'Forma conectiva básica.',
      };
  }
}

export function getPromptLabelForForm(word?: ConjugableWord, form?: JapaneseConjugationForm): string {
  return getPromptDetailsForForm(word, form).title;
}

export function ConjugationPracticeModal({
  visible,
  onClose,
  deckId,
  deckName,
}: ConjugationPracticeModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Un solo movimiento por vez: varios toques rápidos no abren pantallas repetidas ni vuelven atrás de más
  const router = useSingleNavigation();
  const [showModelRequired, setShowModelRequired] = useState(false);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [rawWords, setRawWords] = useState<ConjugableWord[]>([]);
  const [queue, setQueue] = useState<PracticeQueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedForm, setSelectedForm] = useState<ConjugationFilterForm>('all');

  // Lo escrito (o lo que se oyó por voz)
  const [textInput, setTextInput] = useState('');

  // Estadísticas de la sesión
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAttempted, setTotalAttempted] = useState(0);

  // Modales de administración del mazo de conjugaciones
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  const [addWordsModalVisible, setAddWordsModalVisible] = useState(false);
  const [removeWordsModalVisible, setRemoveWordsModalVisible] = useState(false);
  const [availableWordsToAdd, setAvailableWordsToAdd] = useState<ConjugableWord[]>([]);
  const [loadingManagement, setLoadingManagement] = useState(false);

  // Refs para leer la cola y la tarjeta actual desde los avisos del micrófono y las animaciones
  const queueRef = useRef<PracticeQueueItem[]>([]);
  queueRef.current = queue;
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;

  // Recorrido de la práctica (lib/practice-flow.ts): decide cuándo abrir el micrófono, evaluar y pasar de tarjeta
  const flow = useRef<PracticeFlowState>(initialPracticeFlow);
  const [flowView, setFlowView] = useState<PracticeFlowState>(initialPracticeFlow);
  const hasEvaluated = flowView.result !== null;
  const isCorrect = flowView.result === 'correct';
  const isFinished = flowView.phase === 'finished';
  const micOn = micLooksOn(flowView);
  // Cierre del micrófono en curso: la voz de Yomi espera a que termine (Android no comparte el audio)
  const micClosing = useRef<Promise<unknown>>(Promise.resolve());

  // Animaciones (Reanimated): carga al mantener el micrófono, barra de 7 s, cambio de tarjeta y el micrófono
  // que "respira" mientras escucha (como en el repaso). Las barras se llenan con scaleX: no recalculan el diseño
  const holdProgress = useSharedValue(0);
  const autoNextProgress = useSharedValue(0);
  const cardOpacity = useSharedValue(1);
  const micPulse = useSharedValue(1);
  const holdStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: holdProgress.value }] }));
  const autoNextStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: autoNextProgress.value }] }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: cardOpacity.value }));
  const micPulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: micPulse.value }] }));

  const isListening = flowView.phase === 'listening';
  useEffect(() => {
    if (!isListening) {
      cancelAnimation(micPulse);
      micPulse.value = withTiming(1, { duration: 150 });
      return;
    }
    const breathe = (toValue: number) => withTiming(toValue, { duration: 900, easing: Easing.inOut(Easing.ease) });
    micPulse.value = withRepeat(withSequence(breathe(1.025), breathe(1)), -1);
    return () => cancelAnimation(micPulse);
  }, [isListening]);

  useEffect(() => {
    return () => {
      flow.current = initialPracticeFlow;
      cancelAnimation(autoNextProgress);
      cancelAnimation(cardOpacity);
      speechService.invalidate();
      speechService.abort().catch(() => {});
      stopSpeech();
    };
  }, []);

  // Construcción de la cola de práctica (aleatorización SRS)
  const buildQueue = (words: ConjugableWord[], filter: ConjugationFilterForm): PracticeQueueItem[] => {
    if (words.length === 0) return [];
    const items: PracticeQueueItem[] = [];

    for (const word of words) {
      const isAdjective = word.category?.startsWith('Adjetivo');
      // Adjetivos soportan: te, nakute, ta, nai, nakatta, adverbial, masu, mashita, masen
      // Verbos soportan: te, nakute, ta, nai, nakatta, masu, mashita, masen, mashou
      const allValidForms: JapaneseConjugationForm[] = isAdjective
        ? ['te', 'nakute', 'ta', 'nai', 'nakatta', 'adverbial', 'masu', 'mashita', 'masen']
        : ['te', 'nakute', 'ta', 'nai', 'nakatta', 'masu', 'mashita', 'masen', 'mashou'];

      const disabled = word.disabledConjugations || [];
      const validFormsForWord = allValidForms.filter((f) => !disabled.includes(f));

      if (filter === 'all') {
        for (const form of validFormsForWord) {
          items.push({ word, form });
        }
      } else if (validFormsForWord.includes(filter)) {
        items.push({ word, form: filter });
      }
    }

    // Mezclar la cola completamente para el modo aleatorio estilo SRS
    return [...items].sort(() => Math.random() - 0.5);
  };

  // Carga inicial de verbos/adjetivos conjugables del mazo
  useEffect(() => {
    if (visible && deckId) {
      preloadAudioService('ja-JP').catch(() => {});
      loadWords();
    } else {
      resetSession();
    }
  }, [visible, deckId]);

  const loadWords = async () => {
    setLoading(true);
    try {
      const items = await getConjugableWordsForDeck(deckId);
      setRawWords(items);
      const initialQueue = buildQueue(items, selectedForm);
      setQueue(initialQueue);
      setCurrentIndex(0);
      currentIndexRef.current = 0;
      setCorrectCount(0);
      setTotalAttempted(0);
      restartCards();
    } catch (e) {
      console.warn('Error cargando verbos conjugables:', e);
    } finally {
      setLoading(false);
    }
  };

  const openAddWordsModal = async () => {
    setOptionsMenuVisible(false);
    setLoadingManagement(true);
    setAddWordsModalVisible(true);
    try {
      const wordsToAdd = await getAvailableDeckWordsForConjugation(deckId);
      setAvailableWordsToAdd(wordsToAdd);
    } catch (e) {
      console.warn('Error cargando palabras disponibles para agregar:', e);
    } finally {
      setLoadingManagement(false);
    }
  };

  const openRemoveWordsModal = () => {
    setOptionsMenuVisible(false);
    setRemoveWordsModalVisible(true);
  };

  const handleAddWordToConjugations = async (word: ConjugableWord) => {
    try {
      await setWordConjugationEnabled(word.id, true);
      setAvailableWordsToAdd((prev) => prev.filter((w) => w.id !== word.id));
      await loadWords();
    } catch (e) {
      console.warn('Error al agregar palabra a conjugaciones:', e);
    }
  };

  const handleRemoveWordFromConjugations = async (word: ConjugableWord) => {
    try {
      await setWordConjugationEnabled(word.id, false);
      await loadWords();
    } catch (e) {
      console.warn('Error al remover palabra de conjugaciones:', e);
    }
  };

  const handleSelectForm = (newFilter: ConjugationFilterForm) => {
    setSelectedForm(newFilter);
    const newQueue = buildQueue(rawWords, newFilter);
    setQueue(newQueue);
    setCurrentIndex(0);
    currentIndexRef.current = 0;
    restartCards();
  };

  const handleDisableCurrentForm = async () => {
    if (!currentWord || !currentForm) return;
    const targetWordId = currentWord.id;
    const targetForm = currentForm;

    try {
      await toggleWordFormConjugation(targetWordId, targetForm, true);

      // Actualizar rawWords en memoria
      const updatedWords = rawWords.map((w) => {
        if (w.id === targetWordId) {
          const currentDisabled = w.disabledConjugations || [];
          return {
            ...w,
            disabledConjugations: [...currentDisabled.filter((f) => f !== targetForm), targetForm],
          };
        }
        return w;
      });
      setRawWords(updatedWords);

      // Si hay más tarjetas en cola con esta misma palabra y forma, removerlas
      const updatedQueue = queueRef.current.filter((item, idx) => {
        if (idx <= currentIndexRef.current) return true;
        return !(item.word.id === targetWordId && item.form === targetForm);
      });
      queueRef.current = updatedQueue;
      setQueue(updatedQueue);

      // Avanzar inmediatamente a la siguiente palabra
      handleNextWord();
    } catch (e) {
      console.warn('Error al desactivar conjugación:', e);
    }
  };

  const handleReactivateForm = async (wordId: string, form: string) => {
    try {
      await toggleWordFormConjugation(wordId, form, false);
      const updatedWords = rawWords.map((w) => {
        if (w.id === wordId) {
          const currentDisabled = w.disabledConjugations || [];
          return {
            ...w,
            disabledConjugations: currentDisabled.filter((f) => f !== form),
          };
        }
        return w;
      });
      setRawWords(updatedWords);
      const newQueue = buildQueue(updatedWords, selectedForm);
      setQueue(newQueue);
    } catch (e) {
      console.warn('Error al reactivar forma:', e);
    }
  };

  const currentItem = queue[currentIndex];
  const currentWord = currentItem?.word;
  const currentForm = currentItem?.form || 'te';

  // Cálculo de la forma esperada
  const expectedConjugation = currentWord
    ? conjugateJapanese(currentWord.kanji, currentWord.reading, currentWord.category, currentForm)
    : { kanji: '', reading: '' };

  /** Forma esperada de la tarjeta en pantalla (leída de los refs: la usan avisos que llegan después). */
  const activeExpected = () => {
    const item = queueRef.current[currentIndexRef.current];
    if (!item) return null;
    const { kanji, reading } = conjugateJapanese(item.word.kanji, item.word.reading, item.word.category, item.form);
    return { item, kanji, reading };
  };

  /** ¿La respuesta (dicha o escrita) es la forma esperada o una equivalente (じゃない = ではない…)? */
  const isRightAnswer = (answer: string) => {
    const expected = activeExpected();
    if (!expected) return false;
    return matchesConjugationAnswer(
      { written: equivalentConjugations(expected.kanji), readings: equivalentConjugations(expected.reading) },
      answer
    );
  };

  // ───────────── Recorrido ─────────────

  function dispatch(event: PracticeEvent) {
    const { state, effects } = stepPracticeFlow(flow.current, event);
    if (state === flow.current) return;
    flow.current = state;
    setFlowView(state);
    effects.forEach(run);
  }

  /** Tarjetas nuevas en pantalla (carga, cambio de forma, cerrar): todo a reposo. */
  const restartCards = () => {
    cancelAnimation(cardOpacity);
    cardOpacity.value = 1;
    dispatch({ type: 'cardShown' });
  };

  function run(effect: PracticeEffect) {
    switch (effect.type) {
      case 'openMic':
        listen(effect.session);
        break;
      case 'closeMic':
        speechService.invalidate();
        micClosing.current = speechService.abort().catch(() => {});
        break;
      case 'record':
        record(effect.correct);
        break;
      case 'speak': {
        const expected = activeExpected();
        if (expected) micClosing.current.then(() => speakText(expected.kanji, 'ja-JP', expected.reading));
        break;
      }
      case 'stopSpeech':
        stopSpeech();
        break;
      case 'startCountdown': {
        const { turn } = effect;
        autoNextProgress.value = 0;
        autoNextProgress.value = withTiming(1, { duration: PRACTICE_ANSWER_MS, easing: Easing.linear }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(dispatch, { type: 'countdownDone', turn });
        });
        break;
      }
      case 'cancelCountdown':
        // La barra queda donde estaba, para que se vea que se detuvo
        cancelAnimation(autoNextProgress);
        break;
      case 'advance': {
        const { turn } = effect;
        const hasNext = currentIndexRef.current + 1 < queueRef.current.length;
        if (!hasNext) {
          dispatch({ type: 'advanced', turn, hasNext });
          break;
        }
        cardOpacity.value = withTiming(0, { duration: 140, easing: Easing.out(Easing.quad) }, () => {
          'worklet';
          scheduleOnRN(dispatch, { type: 'advanced', turn, hasNext });
        });
        break;
      }
      case 'nextCard': {
        const nextIdx = currentIndexRef.current + 1;
        currentIndexRef.current = nextIdx;
        setCurrentIndex(nextIdx);
        cardOpacity.value = withTiming(1, { duration: 140, easing: Easing.in(Easing.quad) });
        break;
      }
      case 'resetCard':
        setTextInput('');
        cancelAnimation(autoNextProgress);
        autoNextProgress.value = 0;
        break;
    }
  }

  /** Registra el resultado: puntaje de la sesión y racha de la forma (de ella dependen las pistas). */
  function record(correct: boolean) {
    const expected = activeExpected();
    if (!expected) return;
    const { word, form } = expected.item;
    setTotalAttempted((prev) => prev + 1);
    if (correct) setCorrectCount((prev) => prev + 1);
    const nextStreak = correct ? (word.conjugationStreaks?.[form] || 0) + 1 : 0;
    word.conjugationStreaks = { ...word.conjugationStreaks, [form]: nextStreak };
    updateWordConjugationStreak(word.id, form, nextStreak).catch((err) => {
      console.warn('Error al persistir streak de conjugación:', err);
    });
  }

  /** Abre el micrófono (apertura `session`) y le avisa al recorrido lo que pasa. */
  async function listen(session: number) {
    const expected = activeExpected();
    if (!expected) return;
    const isCurrent = () => flow.current.session === session;
    let reportedError = false;

    speechService.invalidate();
    const started = await speechService.start(
      'ja-JP',
      {
        onStart: () => dispatch({ type: 'micStarted', session }),
        onResult: (transcript, isFinal, alternatives = []) => {
          if (!isCurrent() || !transcript || transcript === '[unk]') return;
          setTextInput(romajiToHiragana(transcript));
          const match = [transcript, ...alternatives].some(isRightAnswer);
          dispatch({ type: 'heard', session, match, final: isFinal });
        },
        onError: (err) => {
          if (!isCurrent()) return;
          reportedError = true;
          if (err === MODEL_NOT_DOWNLOADED) setShowModelRequired(true);
          else Alert.alert(t('review.micErrorTitle'), err || t('review.micErrorDefault'));
          dispatch({ type: 'micError', session });
        },
        onEnd: () => dispatch({ type: 'micClosed', session }),
      },
      // Pista solo la forma esperada: la forma de diccionario inclinaría al modelo hacia una respuesta mal
      { contextualStrings: [expected.kanji, expected.reading].filter(Boolean), continuous: true }
    );

    const stillWanted = flow.current.phase === 'starting' || flow.current.phase === 'listening';
    if (!started && isCurrent() && stillWanted) {
      if (!reportedError) Alert.alert(t('review.micNotStartedTitle'), t('review.micNotStartedMsg'));
      dispatch({ type: 'micNotStarted', session });
    }
  }

  // ───────────── Respuesta escrita ─────────────

  // Romaji → hiragana mientras se escribe (la sílaba sin terminar queda en romaji: kan → かn → かな)
  const handleTextChange = (text: string) => setTextInput(romajiToHiraganaAsYouType(text));

  const handleSubmitText = () => {
    const answer = romajiToHiragana(textInput.trim());
    if (!answer || hasEvaluated) return;
    setTextInput(answer);
    dispatch({ type: 'textSubmitted', correct: isRightAnswer(answer) });
  };

  // ───────────── Botón del micrófono ─────────────
  // Toque: abre o apaga. Mantenerlo apretado (la barra se llena): modo automático, se abre solo en cada tarjeta.

  const handleVoicePressIn = () => {
    if (flow.current.auto) return;
    // Los primeros 200 ms no se ve nada: así un toque simple no muestra la barra
    holdProgress.value = 0;
    holdProgress.value = withDelay(HOLD_DELAY_MS, withTiming(1, { duration: HOLD_FILL_MS, easing: Easing.linear }));
  };

  const handleVoicePressOut = () => {
    cancelAnimation(holdProgress);
    holdProgress.value = withTiming(0, { duration: 150 });
  };

  const handleVoiceLongPress = () => {
    holdProgress.value = withTiming(0, { duration: 250 });
    dispatch({ type: 'holdCompleted' });
  };

  const handleNextWord = () => dispatch({ type: 'nextPressed' });

  const resetSession = () => {
    restartCards();
    setRawWords([]);
    setQueue([]);
    queueRef.current = [];
    setCurrentIndex(0);
    currentIndexRef.current = 0;
    setCorrectCount(0);
    setTotalAttempted(0);
  };

  const currentTargetDetails = getPromptDetailsForForm(currentWord, currentForm);
  const currentTargetLabel = currentForm ? getFormLabel(currentForm, t) : t('conjugation.formTe');
  const furiganaPairs = currentWord ? parseFurigana(currentWord.kanji, currentWord.reading) : [];
  const formOptions = getFormOptions(t);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View
        style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 4 }]}
        onTouchStart={() => dispatch({ type: 'touched' })}
      >
        {/* Header superior de práctica */}
        <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} accessibilityLabel={t('conjugation.closePractice')}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.brandTitleContainer}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {deckName || t('deckDetail.deck')} <Text style={[styles.subtitle, { color: colors.textMuted }]}>- {t('conjugation.title')}</Text>
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.moreMenuBtn}
              onPress={() => setOptionsMenuVisible(true)}
              accessibilityLabel={t('conjugation.optionsTitle')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Selector de Modo / Forma Gramatical */}
        <View style={styles.formSelectorContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.formSelectorScroll}>
            {formOptions.map((opt) => {
              const isSelected = selectedForm === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.formChip,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => handleSelectForm(opt.key)}
                >
                  <Text style={[styles.formChipText, { color: colors.text }, isSelected && { color: '#FFF' }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>{t('conjugation.loadingVerbs')}</Text>
          </View>
        ) : queue.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="alert-circle-outline" size={54} color={colors.textMuted} />
            <Text style={[styles.noWordsTitle, { color: colors.text }]}>{t('conjugation.noVerbsTitle')}</Text>
            <Text style={[styles.noWordsDesc, { color: colors.textMuted }]}>
              {t('conjugation.noVerbsDesc')}
            </Text>
            <TouchableOpacity style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]} onPress={onClose}>
              <Text style={styles.primaryActionBtnText}>{t('conjugation.backToDeck')}</Text>
            </TouchableOpacity>
          </View>
        ) : isFinished ? (
          /* Pantalla de Fin de Sesión */
          <View style={styles.centerContainer}>
            <Ionicons name="trophy" size={64} color="#F59E0B" />
            <Text style={[styles.finishedTitle, { color: colors.text }]}>
              {selectedForm === 'all'
                ? t('conjugation.sessionCompleted')
                : t('conjugation.completedCategory', { form: getFormLabel(selectedForm, t) })}
            </Text>
            <Text style={[styles.finishedScore, { color: colors.primary }]}>
              {t('conjugation.scoreResult', { correct: correctCount, total: totalAttempted })}
            </Text>
            <Text style={[styles.finishedSubtext, { color: colors.textMuted }]}>
              {t('conjugation.sessionCompletedSub')}
            </Text>
            <View style={styles.finishedButtonsRow}>
              <TouchableOpacity
                style={[styles.secondaryActionBtn, { borderColor: colors.border }]}
                onPress={() => handleSelectForm(selectedForm)}
              >
                <Ionicons name="refresh" size={18} color={colors.text} style={{ marginRight: 6 }} />
                <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>{t('conjugation.practiceAgain')}</Text>
              </TouchableOpacity>
              {selectedForm !== 'all' && (
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: colors.primary, backgroundColor: colors.surfaceHighlight }]}
                  onPress={() => handleSelectForm('all')}
                >
                  <Ionicons name="shuffle" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.secondaryActionBtnText, { color: colors.primary }]}>{t('conjugation.practiceAllForms')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.primaryActionBtn, { backgroundColor: colors.primary, marginTop: 0 }]} onPress={onClose}>
                <Text style={styles.primaryActionBtnText}>{t('conjugation.finish')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Tarjeta de Ejercicio */
          <ScrollView contentContainerStyle={styles.exerciseScroll} keyboardShouldPersistTaps="handled">
            {/* Barra de Progreso */}
            <View style={styles.progressBarRow}>
              <Text style={[styles.progressText, { color: colors.textMuted }]}>
                {t('conjugation.cardProgress', { current: currentIndex + 1, total: queue.length })}
              </Text>
              <View style={styles.scoreRow}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={[styles.scoreText, { color: '#10B981', marginRight: 10 }]}>{correctCount}</Text>
                <Ionicons name="close-circle" size={16} color="#EF4444" />
                <Text style={[styles.scoreText, { color: '#EF4444' }]}>{totalAttempted - correctCount}</Text>
              </View>
            </View>

            {/* Contenedor Animado de Transición Suave entre Palabras */}
            <Animated.View style={[{ width: '100%' }, cardStyle]}>
              {/* Tarjeta Principal */}
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {/* Badges y Audio */}
                <View style={styles.badgesRow}>
                  {currentWord.category && !currentWord.category.includes('Frase') && (
                    <View style={[styles.categoryBadge, { backgroundColor: colors.surfaceHighlight }]}>
                      <Text style={[styles.categoryBadgeText, { color: colors.primary }]}>{currentWord.category}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.audioIconBtn, { backgroundColor: colors.surfaceHighlight }]}
                    onPress={() => speakText(currentWord.kanji, 'ja-JP')}
                  >
                    <Ionicons name="volume-high" size={18} color={colors.primary} />
                  </TouchableOpacity>
                </View>

                {/* Palabra con Furigana */}
                <View style={styles.kanjiContainer}>
                  {furiganaPairs.map((pair, idx) => (
                    <View key={idx} style={styles.rubyPair}>
                      {pair.furigana ? (
                        <Text style={[styles.furiganaText, { color: colors.primaryHover }]}>{pair.furigana}</Text>
                      ) : (
                        <View style={{ height: 16 }} />
                      )}
                      <Text style={[styles.kanjiText, { color: colors.text }]}>{pair.char}</Text>
                    </View>
                  ))}
                </View>

                {/* Pregunta Objetivo */}
                <View style={styles.targetPromptBox}>
                  <Text style={[styles.targetPromptText, { color: colors.text }]}>
                    {t('conjugation.passTo')} <Text style={{ fontWeight: '800', color: colors.primary }}>{currentTargetLabel}</Text>
                  </Text>
                  {/* Pistas Progresivas según Racha (Streak) simplemente en gris sin la palabra Pista */}
                  {(() => {
                    const currentStreak = currentWord?.conjugationStreaks?.[currentForm] || 0;
                    if (currentStreak === 0) {
                      const suffix = getConjugationSuffix(currentWord?.reading || '', expectedConjugation.reading || '');
                      if (!suffix) return null;
                      return (
                        <Text style={[styles.targetPromptHint, { color: colors.textMuted }]}>
                          {suffix}
                        </Text>
                      );
                    }
                    if (currentStreak === 1) {
                      const distractors = getFormDistractors(currentForm);
                      if (!distractors) return null;
                      return (
                        <Text style={[styles.targetPromptHint, { color: colors.textMuted }]}>
                          {distractors}
                        </Text>
                      );
                    }
                    return null;
                  })()}
                </View>

                {/* Input y Botón de Micrófono */}
                <View style={styles.interactionSection}>
                  <View style={[styles.inputRow, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
                    <TextInput
                      style={[styles.textInput, { color: colors.text }]}
                      placeholder={t('conjugation.placeholderInput')}
                      placeholderTextColor={colors.textMuted}
                      value={textInput}
                      onChangeText={handleTextChange}
                      onSubmitEditing={handleSubmitText}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!hasEvaluated}
                    />
                    {textInput.trim().length > 0 && !hasEvaluated && (
                      <TouchableOpacity style={[styles.sendBtn, { backgroundColor: colors.primary }]} onPress={handleSubmitText}>
                        <Ionicons name="arrow-forward" size={18} color="#FFF" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Botón de Voz con soporte de Modo Automático */}
                  <Animated.View style={micPulseStyle}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.micBtn,
                      {
                        backgroundColor: micOn ? '#EF4444' : colors.surfaceHighlight,
                        borderColor: flowView.auto ? '#EF4444' : colors.border,
                        borderWidth: 1,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                    onPress={() => dispatch({ type: 'micPressed' })}
                    onLongPress={handleVoiceLongPress}
                    delayLongPress={HOLD_DELAY_MS + HOLD_FILL_MS}
                    onPressIn={handleVoicePressIn}
                    onPressOut={handleVoicePressOut}
                    disabled={hasEvaluated}
                  >
                    {/* Barra de progreso de carga al mantener presionado para modo automático */}
                    {!flowView.auto && (
                      <Animated.View style={[styles.micHoldProgress, { backgroundColor: colors.primary + '35' }, holdStyle]} />
                    )}

                    <Ionicons
                      name={micOn ? 'mic' : 'mic-outline'}
                      size={22}
                      color={micOn ? '#FFF' : colors.text}
                    />
                    <View style={{ alignItems: 'flex-start' }}>
                      <Text
                        style={[
                          styles.micBtnText,
                          { color: micOn ? '#FFF' : colors.text },
                        ]}
                      >
                        {micOn ? t('conjugation.listeningVoice') : t('conjugation.respondByVoice')}
                      </Text>
                      {!micOn && (
                        <Text style={[styles.micBtnSubtext, { color: colors.textMuted }]}>
                          {t('conjugation.holdForAutoVoice')}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                  </Animated.View>
                </View>
              </View>

              {/* Retroalimentación Flotante Fuera de la Tarjeta con Animación Suave */}
              {hasEvaluated && (
                <Animated.View
                  entering={FadeInDown.duration(200)}
                  style={[styles.feedbackBox, { backgroundColor: colors.surface, borderColor: isCorrect ? '#10B981' : colors.danger }]}
                >
                  <View style={styles.feedbackHeader}>
                    <Ionicons
                      name={isCorrect ? 'checkmark-circle' : 'close-circle'}
                      size={24}
                      color={isCorrect ? '#10B981' : colors.danger}
                    />
                    <Text
                      style={[
                        styles.feedbackTitle,
                        { color: isCorrect ? '#10B981' : colors.danger },
                      ]}
                    >
                      {isCorrect ? t('conjugation.excellent') : t('conjugation.correctForm')}
                    </Text>
                  </View>

                  {/* Respuesta: Kanji arriba, lectura abajo 2px más chica sin paréntesis */}
                  <View style={styles.answerContainer}>
                    <Text style={[styles.correctAnswerText, { color: colors.text }]}>
                      {expectedConjugation.kanji}
                    </Text>
                    {expectedConjugation.reading !== expectedConjugation.kanji && (
                      <Text style={[styles.correctAnswerReading, { color: colors.textMuted }]}>
                        {expectedConjugation.reading}
                      </Text>
                    )}
                  </View>

                  {/* Barra ascendente de tiempo para pasar de tarjeta */}
                  <View style={[styles.autoAdvanceTrack, { backgroundColor: colors.surfaceHighlight }]}>
                    <Animated.View
                      style={[styles.autoAdvanceFill, { backgroundColor: isCorrect ? '#10B981' : colors.primary }, autoNextStyle]}
                    />
                  </View>

                  {/* Botones de acción en retroalimentación */}
                  <View style={styles.feedbackActionsRow}>
                    <TouchableOpacity
                      style={[styles.disableFormBtn, { borderColor: colors.border, backgroundColor: colors.surfaceHighlight }]}
                      onPress={handleDisableCurrentForm}
                      accessibilityLabel="Marcar forma como dominada y no volver a preguntar"
                    >
                      <Ionicons name="school-outline" size={17} color={colors.primary} style={{ marginRight: 6 }} />
                      <Text style={[styles.disableFormBtnText, { color: colors.text }]}>
                        {t('conjugation.masteredBtn')}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                      onPress={handleNextWord}
                    >
                      <Text style={styles.nextBtnText}>{t('conjugation.nextBtn')}</Text>
                      <Ionicons name="chevron-forward" size={18} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}
            </Animated.View>
          </ScrollView>
        )}

        {/* Modal de 3 puntos (Opciones del mazo de conjugaciones) */}
        <Modal
          visible={optionsMenuVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setOptionsMenuVisible(false)}
        >
          <Pressable
            style={[styles.modalOverlay, { paddingTop: insets.top + 48 }]}
            onPress={() => setOptionsMenuVisible(false)}
          >
            <View style={[styles.menuDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.menuDropdownTitle, { color: colors.textMuted }]}>{t('conjugation.optionsTitle')}</Text>

              <TouchableOpacity
                style={[styles.menuDropdownItem, { borderBottomColor: colors.border }]}
                onPress={openAddWordsModal}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={[styles.menuDropdownText, { color: colors.text, fontWeight: '600' }]}>{t('conjugation.addWords')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuDropdownItem, { borderBottomWidth: 0 }]}
                onPress={openRemoveWordsModal}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} style={{ marginRight: 10 }} />
                <Text style={[styles.menuDropdownText, { color: colors.danger, fontWeight: '600' }]}>{t('conjugation.removeWords')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>

        {/* Modal: Agregar Palabras */}
        <Modal
          visible={addWordsModalVisible}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setAddWordsModalVisible(false)}
        >
          <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 4 }]}>
            <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setAddWordsModalVisible(false)} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <View style={styles.brandTitleContainer}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                  {deckName || t('deckDetail.deck')} <Text style={[styles.subtitle, { color: colors.textMuted }]}>- {t('conjugation.addWords')}</Text>
                </Text>
              </View>
            </View>

            {/* Lista de formas dominadas/inactivas para reactivar */}
            {rawWords.some((w) => (w.disabledConjugations?.length || 0) > 0) && (
              <View style={{ padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>
                  {t('conjugation.masteredSectionTitle')}
                </Text>
                <Text style={[styles.sectionHeaderSubtitle, { color: colors.textMuted }]}>
                  {t('conjugation.masteredSectionSubtitle')}
                </Text>
                {rawWords
                  .filter((w) => (w.disabledConjugations?.length || 0) > 0)
                  .flatMap((w) =>
                    (w.disabledConjugations || []).map((f) => {
                      const conj = conjugateJapanese(
                        w.kanji,
                        w.reading,
                        w.category,
                        f as JapaneseConjugationForm
                      );
                      const formLabel = getFormLabel(f as JapaneseConjugationForm, t);
                      return {
                        wordId: w.id,
                        baseKanji: w.kanji,
                        baseReading: w.reading,
                        form: f,
                        formLabel,
                        conjugatedKanji: conj.kanji,
                        conjugatedReading: conj.reading,
                      };
                    })
                  )
                  .map((item) => (
                    <View
                      key={`disabled_${item.wordId}_${item.form}`}
                      style={[styles.manageWordCard, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 8 }]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <Text style={[styles.manageWordKanji, { color: colors.text }]}>
                            {item.conjugatedKanji}
                          </Text>
                          {item.conjugatedReading !== item.conjugatedKanji && (
                            <Text style={[styles.manageWordReading, { color: colors.primary }]}>
                              ({item.conjugatedReading})
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.manageWordCategory, { color: colors.textMuted }]}>
                          {item.formLabel} • Base: {item.baseKanji}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.removeWordBtn,
                          { backgroundColor: 'transparent', borderColor: colors.primary },
                        ]}
                        onPress={() => handleReactivateForm(item.wordId, item.form)}
                      >
                        <Ionicons name="refresh" size={14} color={colors.primary} />
                        <Text style={[styles.removeWordBtnText, { color: colors.primary }]}>{t('conjugation.studyBtn')}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
              </View>
            )}

            {loadingManagement ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>{t('conjugation.loadingDeckWords')}</Text>
              </View>
            ) : availableWordsToAdd.length === 0 ? (
              <View style={styles.centerContainer}>
                <Ionicons name="checkmark-circle-outline" size={54} color="#10B981" />
                <Text style={[styles.noWordsTitle, { color: colors.text }]}>{t('conjugation.allWordsAddedTitle')}</Text>
                <Text style={[styles.noWordsDesc, { color: colors.textMuted }]}>
                  {t('conjugation.allWordsAddedDesc')}
                </Text>
              </View>
            ) : (
              <FlatList
                data={availableWordsToAdd}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
                renderItem={({ item }) => (
                  <View style={[styles.manageWordCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={[styles.manageWordKanji, { color: colors.text }]}>{item.kanji}</Text>
                        <Text style={[styles.manageWordReading, { color: colors.primary }]}>({item.reading})</Text>
                      </View>
                      <Text style={[styles.manageWordCategory, { color: colors.textMuted }]}>{item.category}</Text>
                      <Text style={[styles.manageWordMeaning, { color: colors.text }]} numberOfLines={1}>
                        {item.meanings.join(', ')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.addWordBtn, { backgroundColor: colors.primary }]}
                      onPress={() => handleAddWordToConjugations(item)}
                    >
                      <Ionicons name="add" size={18} color="#FFF" />
                      <Text style={styles.addWordBtnText}>{t('conjugation.addWordBtn')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        </Modal>

        {/* Modal: Eliminar Palabras */}
        <Modal
          visible={removeWordsModalVisible}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setRemoveWordsModalVisible(false)}
        >
          <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 4 }]}>
            <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setRemoveWordsModalVisible(false)} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <View style={styles.brandTitleContainer}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                  {deckName || t('deckDetail.deck')} <Text style={[styles.subtitle, { color: colors.textMuted }]}>- {t('conjugation.removeWords')}</Text>
                </Text>
              </View>
            </View>

            {rawWords.length === 0 ? (
              <View style={styles.centerContainer}>
                <Ionicons name="alert-circle-outline" size={54} color={colors.textMuted} />
                <Text style={[styles.noWordsTitle, { color: colors.text }]}>{t('conjugation.noWordsInPracticeTitle')}</Text>
                <Text style={[styles.noWordsDesc, { color: colors.textMuted }]}>
                  {t('conjugation.noWordsInPracticeDesc')}
                </Text>
              </View>
            ) : (
              <FlatList
                data={rawWords}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
                renderItem={({ item }) => (
                  <View style={[styles.manageWordCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={[styles.manageWordKanji, { color: colors.text }]}>{item.kanji}</Text>
                        <Text style={[styles.manageWordReading, { color: colors.primary }]}>({item.reading})</Text>
                      </View>
                      <Text style={[styles.manageWordCategory, { color: colors.textMuted }]}>{item.category}</Text>
                      <Text style={[styles.manageWordMeaning, { color: colors.text }]} numberOfLines={1}>
                        {item.meanings.join(', ')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.removeWordBtn, { backgroundColor: 'transparent', borderColor: colors.danger }]}
                      onPress={() => handleRemoveWordFromConjugations(item)}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      <Text style={[styles.removeWordBtnText, { color: colors.danger }]}>{t('conjugation.removeWordBtn')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        </Modal>

        <VoiceModelRequiredModal
          visible={showModelRequired}
          languageCode="ja-JP"
          colors={colors}
          onClose={() => setShowModelRequired(false)}
          onGoToDownload={() => {
            setShowModelRequired(false);
            onClose();
            router.push({ pathname: '/profile', params: { section: 'audio' } });
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,

    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: Spacing.xs,
    marginRight: Spacing.xs,
  },
  brandTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moreMenuBtn: {
    padding: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  formSelectorContainer: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  formSelectorScroll: {
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  formChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  formChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 60,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 14,
    textAlign: 'center',
  },
  noWordsTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  noWordsDesc: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 20,
    maxWidth: 320,
  },
  primaryActionBtn: {
    marginTop: Spacing.lg,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  primaryActionBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  finishedTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  finishedScore: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
  },
  finishedButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: Spacing.xl,
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  secondaryActionBtnText: {
    fontWeight: '600',
    fontSize: 14,
  },
  exerciseScroll: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  progressBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  audioIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  kanjiContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  rubyPair: {
    alignItems: 'center',
  },
  furiganaText: {
    fontSize: 13,
    fontWeight: '600',
    height: 16,
  },
  kanjiText: {
    fontSize: 36,
    fontWeight: '800',
  },
  meaningText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  targetPromptBox: {
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  targetPromptText: {
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  targetPromptHint: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '500',
  },
  interactionSection: {
    gap: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    gap: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  micHoldProgress: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    transformOrigin: 'left',
  },
  micBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  micBtnSubtext: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  spokenText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  feedbackBox: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    paddingTop: Spacing.sm + 2,
    paddingBottom: Spacing.sm + 4,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 4,
    elevation: 0,
    shadowOpacity: 0,
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 0,
  },
  feedbackTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  answerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 0,
  },
  correctAnswerText: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 24,
  },
  correctAnswerReading: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 1,
    lineHeight: 18,
  },
  autoAdvanceTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 2,
  },
  autoAdvanceFill: {
    width: '100%',
    height: '100%',
    borderRadius: 2,
    transformOrigin: 'left',
  },
  feedbackActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 0,
  },
  disableFormBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: Spacing.xs,
  },
  disableFormBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    gap: 6,
  },
  nextBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  finishedSubtext: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeaderSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 8,
  },
  reactivateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  reactivateChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Estilos del menú dropdown modal de 3 puntos
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingRight: 12,
  },
  menuDropdown: {
    width: 215,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: Spacing.xs,
    ...Shadows.card,
    elevation: 10,
  },
  menuDropdownTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    letterSpacing: 0.5,
  },
  menuDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuDropdownText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Estilos para las tarjetas de administración de palabras
  manageWordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    ...Shadows.card,
  },
  manageWordKanji: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  manageWordReading: {
    fontSize: 14,
    fontWeight: '600',
  },
  manageWordCategory: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  manageWordMeaning: {
    fontSize: 13,
  },
  addWordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: Spacing.sm,
  },
  addWordBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  removeWordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginLeft: Spacing.sm,
  },
  removeWordBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
