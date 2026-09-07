import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { speakText } from '../../lib/audio-service';
import { parseFurigana } from '../../lib/japanese-search';
import {
  conjugateJapanese,
  JapaneseConjugationForm,
  romajiToHiragana,
  toNormalizedHiragana,
} from '../../lib/japanese-utils';
import { speechService } from '../../lib/speech-recognition-service';
import {
  ConjugableWord,
  getAvailableDeckWordsForConjugation,
  getConjugableWordsForDeck,
  setWordConjugationEnabled,
  toggleWordFormConjugation,
} from '../../lib/word-service';
import { useTheme } from '../../providers/ThemeProvider';
import { Shadows, Spacing } from '../constants/theme';

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

const FORM_OPTIONS: Array<{ key: ConjugationFilterForm; label: string; suffix: string }> = [
  { key: 'all', label: 'Aleatorio (Todas)', suffix: 'Todas' },
  { key: 'te', label: 'Forma -TE', suffix: '-て / -で / -くて' },
  { key: 'nakute', label: 'Forma -TE Negativa', suffix: '-なくて / -ないで' },
  { key: 'ta', label: 'Pasado', suffix: '-た / -だ / -かった / -だった' },
  { key: 'nai', label: 'Negativo', suffix: '-ない / -くない / -じゃない' },
  { key: 'nakatta', label: 'Pasado Negativo', suffix: '-なかった / -くなかった / -じゃなかった' },
  { key: 'adverbial', label: 'Forma Adverbial', suffix: '-く / -に' },
  { key: 'masu', label: 'Formal', suffix: '-ます / -です' },
  { key: 'mashita', label: 'Pasado Formal', suffix: '-ました / -でした' },
  { key: 'masen', label: 'Negativo Formal', suffix: '-ません / -じゃありません' },
  { key: 'mashou', label: 'Volitiva', suffix: '-ましょう' },
];

const FORM_LABELS: Record<JapaneseConjugationForm, string> = {
  te: 'Forma -TE',
  nakute: 'Forma -TE Negativa',
  ta: 'Pasado',
  nai: 'Negativo',
  nakatta: 'Pasado Negativo',
  adverbial: 'Forma Adverbial',
  masu: 'Formal',
  mashita: 'Pasado Formal',
  masen: 'Negativo Formal',
  mashou: 'Volitiva',
};

export function getPromptLabelForForm(word?: ConjugableWord, form?: JapaneseConjugationForm): string {
  if (!form) return 'Forma -TE';

  switch (form) {
    case 'masu':
      return 'Forma Formal';
    case 'mashita':
      return 'Pasado Formal';
    case 'masen':
      return 'Negativo Formal';
    case 'mashou':
      return 'Forma Volitiva';
    case 'ta':
      return 'Pasado';
    case 'nai':
      return 'Negativo';
    case 'nakatta':
      return 'Pasado Negativo';
    case 'te':
      return 'Forma -TE';
    case 'nakute':
      return 'Forma -TE Negativa';
    case 'adverbial':
      return 'Forma Adverbial';
    default:
      return 'Forma -TE';
  }
}

export function ConjugationPracticeModal({
  visible,
  onClose,
  deckId,
  deckName,
}: ConjugationPracticeModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [rawWords, setRawWords] = useState<ConjugableWord[]>([]);
  const [queue, setQueue] = useState<PracticeQueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedForm, setSelectedForm] = useState<ConjugationFilterForm>('all');

  // Input y estado de respuesta
  const [textInput, setTextInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [spokenTranscript, setSpokenTranscript] = useState('');
  const [hasEvaluated, setHasEvaluated] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

  // Estadísticas de la sesión
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAttempted, setTotalAttempted] = useState(0);
  const [isFinished, setIsFinished] = useState(false);

  // Modales de administración del mazo de conjugaciones
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  const [addWordsModalVisible, setAddWordsModalVisible] = useState(false);
  const [removeWordsModalVisible, setRemoveWordsModalVisible] = useState(false);
  const [availableWordsToAdd, setAvailableWordsToAdd] = useState<ConjugableWord[]>([]);
  const [loadingManagement, setLoadingManagement] = useState(false);

  // Refs para evitar problemas de stale closures en modo automático / callbacks asíncronos
  const queueRef = useRef<PracticeQueueItem[]>([]);
  queueRef.current = queue;
  const currentIndexRef = useRef(0);
  currentIndexRef.current = currentIndex;
  const hasEvaluatedRef = useRef(false);
  hasEvaluatedRef.current = hasEvaluated;

  // Modo continuo / automático por voz
  const [autoVoiceMode, setAutoVoiceMode] = useState(false);
  const autoVoiceModeRef = useRef(false);
  const justTriggeredHoldRef = useRef(false);
  const holdProgress = useRef(new Animated.Value(0)).current;
  const holdTimeoutRef = useRef<any>(null);
  const autoNextProgress = useRef(new Animated.Value(0)).current;
  const cardTransitionAnim = useRef(new Animated.Value(1)).current;
  const feedbackAnim = useRef(new Animated.Value(0)).current;
  const isTransitioningRef = useRef(false);

  // Timer para pasaje automático entre tarjetas estilo SRS
  const autoNextTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (autoNextTimerRef.current) {
        clearTimeout(autoNextTimerRef.current);
      }
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
      }
      autoNextProgress.stopAnimation();
      speechService.stop();
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
      setCorrectCount(0);
      setTotalAttempted(0);
      setIsFinished(false);
      resetCardState();
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
    setIsFinished(false);
    resetCardState();
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

  const resetCardState = () => {
    if (autoNextTimerRef.current) {
      clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    autoNextProgress.stopAnimation();
    autoNextProgress.setValue(0);
    feedbackAnim.stopAnimation();
    feedbackAnim.setValue(0);
    setTextInput('');
    setSpokenTranscript('');
    setHasEvaluated(false);
    hasEvaluatedRef.current = false;
    setIsCorrect(null);
    speechService.stop();
    setIsListening(false);
  };

  const resetSession = () => {
    resetCardState();
    autoVoiceModeRef.current = false;
    setAutoVoiceMode(false);
    setRawWords([]);
    setQueue([]);
    queueRef.current = [];
    setCurrentIndex(0);
    currentIndexRef.current = 0;
    setCorrectCount(0);
    setTotalAttempted(0);
    setIsFinished(false);
  };

  const currentItem = queue[currentIndex];
  const currentWord = currentItem?.word;
  const currentForm = currentItem?.form || 'te';

  // Cálculo de la forma esperada
  const expectedConjugation = currentWord
    ? conjugateJapanese(currentWord.kanji, currentWord.reading, currentWord.category, currentForm)
    : { kanji: '', reading: '' };

  // Detener la barra ascendente y cancelar el timer automático al tocar la pantalla
  const stopAutoAdvanceTimer = () => {
    if (autoNextTimerRef.current) {
      clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
      autoNextProgress.stopAnimation();
    }
  };

  // Timer para pasaje automático estilo repaso SRS (7.0s) con barra ascendente
  const startAutoNextTimer = () => {
    if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);
    autoNextProgress.setValue(0);
    Animated.timing(autoNextProgress, {
      toValue: 1,
      duration: 7000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    autoNextTimerRef.current = setTimeout(() => {
      handleNextWord();
    }, 7000);
  };

  // Evaluación de la respuesta
  const evaluateAnswer = (answer: string) => {
    if (!answer || !answer.trim() || hasEvaluatedRef.current) return;

    // Obtener la palabra actual y forma esperada directamente desde los refs para evitar stale closures
    const currentQueue = queueRef.current;
    const currentIdx = currentIndexRef.current;
    const activeItem = currentQueue[currentIdx];
    if (!activeItem) return;

    const activeWord = activeItem.word;
    const activeForm = activeItem.form;
    const expected = conjugateJapanese(
      activeWord.kanji,
      activeWord.reading,
      activeWord.category,
      activeForm
    );

    // Detener el micrófono inmediatamente al evaluar
    speechService.stop();
    setIsListening(false);

    const cleanAnswer = answer.trim();
    const normalizedAnswer = toNormalizedHiragana(cleanAnswer);
    const normalizedExpected = toNormalizedHiragana(expected.reading);

    const validCandidates = new Set<string>();
    validCandidates.add(cleanAnswer);
    validCandidates.add(normalizedAnswer);

    const validTargets = new Set<string>();
    validTargets.add(expected.kanji);
    validTargets.add(expected.reading);
    validTargets.add(normalizedExpected);

    // Variaciones comunes aceptadas:
    // 1. 〜なくて <-> 〜ないで
    if (normalizedExpected.endsWith('なくて')) {
      validTargets.add(normalizedExpected.replace(/なくて$/, 'ないで'));
    }
    if (normalizedExpected.endsWith('ないで')) {
      validTargets.add(normalizedExpected.replace(/ないで$/, 'なくて'));
    }

    // 2. 〜じゃない <-> 〜ではない
    if (normalizedExpected.endsWith('じゃない')) {
      validTargets.add(normalizedExpected.replace(/じゃない$/, 'ではない'));
    }
    if (normalizedExpected.endsWith('ではない')) {
      validTargets.add(normalizedExpected.replace(/ではない$/, 'じゃない'));
    }

    // 3. 〜じゃなかった <-> 〜ではなかった
    if (normalizedExpected.endsWith('じゃなかった')) {
      validTargets.add(normalizedExpected.replace(/じゃなかった$/, 'ではなかった'));
    }
    if (normalizedExpected.endsWith('ではなかった')) {
      validTargets.add(normalizedExpected.replace(/ではなかった$/, 'じゃなかった'));
    }

    // 4. 〜じゃなくて <-> 〜ではなくて
    if (normalizedExpected.endsWith('じゃなくて')) {
      validTargets.add(normalizedExpected.replace(/じゃなくて$/, 'ではなくて'));
    }
    if (normalizedExpected.endsWith('ではなくて')) {
      validTargets.add(normalizedExpected.replace(/ではなくて$/, 'じゃなくて'));
    }

    // 5. 〜じゃありません <-> 〜じゃないです <-> 〜ではありません
    if (normalizedExpected.endsWith('じゃありません')) {
      validTargets.add(normalizedExpected.replace(/じゃありません$/, 'じゃないです'));
      validTargets.add(normalizedExpected.replace(/じゃありません$/, 'ではありません'));
    }
    if (normalizedExpected.endsWith('じゃないです')) {
      validTargets.add(normalizedExpected.replace(/じゃないです$/, 'じゃありません'));
      validTargets.add(normalizedExpected.replace(/じゃないです$/, 'ではありません'));
    }

    // 6. 〜くないです <-> 〜くありません
    if (normalizedExpected.endsWith('くないです')) {
      validTargets.add(normalizedExpected.replace(/くないです$/, 'くありません'));
    }
    if (normalizedExpected.endsWith('くありません')) {
      validTargets.add(normalizedExpected.replace(/くありません$/, 'くないです'));
    }

    // 7. 〜くなかったです <-> 〜くありませんでした
    if (normalizedExpected.endsWith('くなかったです')) {
      validTargets.add(normalizedExpected.replace(/くなかったです$/, 'くありませんでした'));
    }

    // Suffix match: si el usuario responde únicamente con el sufijo (mínimo 2 caracteres kana)
    const isSuffixMatch = Array.from(validTargets).some(
      (target) =>
        normalizedAnswer.length >= 2 &&
        toNormalizedHiragana(target).endsWith(normalizedAnswer)
    );

    const match =
      Array.from(validTargets).some(
        (target) => validCandidates.has(target) || validCandidates.has(toNormalizedHiragana(target))
      ) || isSuffixMatch;

    setIsCorrect(match);
    setHasEvaluated(true);
    hasEvaluatedRef.current = true;
    setTotalAttempted((prev) => prev + 1);
    if (match) {
      setCorrectCount((prev) => prev + 1);
      speakText(expected.kanji, 'ja-JP');
    }

    // Animación suave de entrada del feedback sin saltos
    feedbackAnim.setValue(0);
    Animated.timing(feedbackAnim, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    // Iniciar pasaje automático de tarjeta tras evaluar
    startAutoNextTimer();
  };

  // Manejador del Input de texto con conversión automática Romaji -> Hiragana
  const handleTextChange = (text: string) => {
    const converted = romajiToHiragana(text);
    setTextInput(converted);
  };

  const handleSubmitText = () => {
    if (!textInput.trim() || hasEvaluatedRef.current) return;
    evaluateAnswer(textInput);
  };

  // Control de reconocimiento por voz
  const startListening = async () => {
    if (hasEvaluatedRef.current) return;
    setSpokenTranscript('');
    setIsListening(true);
    try {
      await speechService.stop();
    } catch { }
    const started = await speechService.start('ja-JP', {
      onStart: () => setIsListening(true),
      onResult: (transcript, isFinal) => {
        if (hasEvaluatedRef.current) return;
        const hira = romajiToHiragana(transcript);
        setTextInput(hira);
        setSpokenTranscript(transcript);
        if (isFinal && transcript.trim()) {
          speechService.stop();
          setIsListening(false);
          evaluateAnswer(hira);
        }
      },
      onError: () => {
        // En modo automático, si Google Speech da timeout o error antes de responder, reconectar automáticamente
        if (autoVoiceModeRef.current && !hasEvaluatedRef.current) {
          setTimeout(() => {
            if (autoVoiceModeRef.current && !hasEvaluatedRef.current) {
              startListening();
            }
          }, 300);
        } else {
          setIsListening(false);
        }
      },
      onEnd: () => {
        // En modo automático, si Google Speech finaliza por silencio antes de responder, reconectar automáticamente
        if (autoVoiceModeRef.current && !hasEvaluatedRef.current) {
          setTimeout(() => {
            if (autoVoiceModeRef.current && !hasEvaluatedRef.current) {
              startListening();
            }
          }, 200);
        } else {
          setIsListening(false);
        }
      },
    });

    if (started) {
      setIsListening(true);
    } else {
      if (!autoVoiceModeRef.current) {
        setIsListening(false);
      }
    }
  };

  const toggleVoiceListening = async () => {
    // Si acaba de activarse por pulsación larga, ignorar el evento onPress disparado al soltar el dedo
    if (justTriggeredHoldRef.current) {
      justTriggeredHoldRef.current = false;
      return;
    }

    // Si está escuchando o el modo automático está activo, tocar el botón apaga ambos inmediatamente
    if (isListening || autoVoiceModeRef.current) {
      autoVoiceModeRef.current = false;
      setAutoVoiceMode(false);
      await speechService.stop();
      setIsListening(false);
      return;
    }
    startListening();
  };

  const handleVoicePressIn = () => {
    if (hasEvaluatedRef.current || autoVoiceModeRef.current) return;
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);

    // Esperar 200ms antes de disparar la animación de carga para no afectar toques simples
    holdTimeoutRef.current = setTimeout(() => {
      Animated.timing(holdProgress, {
        toValue: 1,
        duration: 550,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) {
          justTriggeredHoldRef.current = true;
          autoVoiceModeRef.current = true;
          setAutoVoiceMode(true);
          setIsListening(true);
          startListening();
          Animated.timing(holdProgress, {
            toValue: 0,
            duration: 250,
            useNativeDriver: false,
          }).start();
          setTimeout(() => {
            justTriggeredHoldRef.current = false;
          }, 400);
        }
      });
    }, 200);
  };

  const handleVoicePressOut = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    holdProgress.stopAnimation();
    Animated.timing(holdProgress, {
      toValue: 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  };

  const handleNextWord = () => {
    if (isTransitioningRef.current) return;
    if (autoNextTimerRef.current) {
      clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
    autoNextProgress.stopAnimation();
    autoNextProgress.setValue(0);
    speechService.stop();
    setIsListening(false);

    if (currentIndexRef.current + 1 < queueRef.current.length) {
      const nextIdx = currentIndexRef.current + 1;
      isTransitioningRef.current = true;

      // Transición fluida entre palabras: Fade-out breve (140ms)
      Animated.timing(cardTransitionAnim, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        // En opacidad 0, cambiar la palabra y limpiar estados sin saltos visibles
        currentIndexRef.current = nextIdx;
        setCurrentIndex(nextIdx);
        resetCardState();

        // Fade-in de la nueva palabra (140ms)
        Animated.timing(cardTransitionAnim, {
          toValue: 1,
          duration: 140,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          isTransitioningRef.current = false;
          // Si el modo automático de voz está activo, comenzar a escuchar inmediatamente en la siguiente tarjeta
          if (autoVoiceModeRef.current) {
            setIsListening(true);
            setTimeout(() => {
              startListening();
            }, 100);
          }
        });
      });
    } else {
      setIsFinished(true);
    }
  };

  const currentTargetLabel = getPromptLabelForForm(currentWord, currentForm);
  const furiganaPairs = currentWord ? parseFurigana(currentWord.kanji, currentWord.reading) : [];

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View
        style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 4 }]}
        onStartShouldSetResponderCapture={() => {
          if (hasEvaluated && autoNextTimerRef.current) {
            stopAutoAdvanceTimer();
          }
          return false;
        }}
        onTouchStart={() => {
          if (hasEvaluated && autoNextTimerRef.current) {
            stopAutoAdvanceTimer();
          }
        }}
      >
        {/* Header superior de práctica */}
        <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} accessibilityLabel="Cerrar práctica">
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.brandTitleContainer}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {deckName || 'Mazo'} <Text style={[styles.subtitle, { color: colors.textMuted }]}>- Práctica de conjugaciones</Text>
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.moreMenuBtn}
              onPress={() => setOptionsMenuVisible(true)}
              accessibilityLabel="Opciones de conjugación"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Selector de Modo / Forma Gramatical */}
        <View style={styles.formSelectorContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.formSelectorScroll}>
            {FORM_OPTIONS.map((opt) => {
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
            <Text style={[styles.loadingText, { color: colors.textMuted }]}>Cargando verbos del mazo...</Text>
          </View>
        ) : queue.length === 0 ? (
          <View style={styles.centerContainer}>
            <Ionicons name="alert-circle-outline" size={54} color={colors.textMuted} />
            <Text style={[styles.noWordsTitle, { color: colors.text }]}>No se encontraron verbos</Text>
            <Text style={[styles.noWordsDesc, { color: colors.textMuted }]}>
              Este mazo no tiene verbos o adjetivos guardados aún. Agregá verbos como 食べる, 行く o 飲む desde la búsqueda para ejercitar su conjugación.
            </Text>
            <TouchableOpacity style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]} onPress={onClose}>
              <Text style={styles.primaryActionBtnText}>Volver al Mazo</Text>
            </TouchableOpacity>
          </View>
        ) : isFinished ? (
          /* Pantalla de Fin de Sesión */
          <View style={styles.centerContainer}>
            <Ionicons name="trophy" size={64} color="#F59E0B" />
            <Text style={[styles.finishedTitle, { color: colors.text }]}>
              {selectedForm === 'all'
                ? '¡Sesión Completada!'
                : `¡Completaste todas las tarjetas de ${FORM_LABELS[selectedForm]}!`}
            </Text>
            <Text style={[styles.finishedScore, { color: colors.primary }]}>
              {correctCount} de {totalAttempted} correctas
            </Text>
            <Text style={[styles.finishedSubtext, { color: colors.textMuted }]}>
              Podés repetir esta categoría o tocar cualquier pestaña superior para continuar practicando otras formas.
            </Text>
            <View style={styles.finishedButtonsRow}>
              <TouchableOpacity
                style={[styles.secondaryActionBtn, { borderColor: colors.border }]}
                onPress={() => handleSelectForm(selectedForm)}
              >
                <Ionicons name="refresh" size={18} color={colors.text} style={{ marginRight: 6 }} />
                <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>Practicar de nuevo</Text>
              </TouchableOpacity>
              {selectedForm !== 'all' && (
                <TouchableOpacity
                  style={[styles.secondaryActionBtn, { borderColor: colors.primary, backgroundColor: colors.surfaceHighlight }]}
                  onPress={() => handleSelectForm('all')}
                >
                  <Ionicons name="shuffle" size={18} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.secondaryActionBtnText, { color: colors.primary }]}>Practicar todas las formas</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.primaryActionBtn, { backgroundColor: colors.primary, marginTop: 0 }]} onPress={onClose}>
                <Text style={styles.primaryActionBtnText}>Finalizar</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Tarjeta de Ejercicio */
          <ScrollView contentContainerStyle={styles.exerciseScroll} keyboardShouldPersistTaps="handled">
            {/* Barra de Progreso */}
            <View style={styles.progressBarRow}>
              <Text style={[styles.progressText, { color: colors.textMuted }]}>
                Tarjeta {currentIndex + 1} de {queue.length}
              </Text>
              <View style={styles.scoreRow}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={[styles.scoreText, { color: '#10B981', marginRight: 10 }]}>{correctCount}</Text>
                <Ionicons name="close-circle" size={16} color="#EF4444" />
                <Text style={[styles.scoreText, { color: '#EF4444' }]}>{totalAttempted - correctCount}</Text>
              </View>
            </View>

            {/* Contenedor Animado de Transición Suave entre Palabras */}
            <Animated.View style={{ opacity: cardTransitionAnim, width: '100%' }}>
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
                    Pasar a <Text style={{ fontWeight: '800', color: colors.primary }}>{currentTargetLabel}</Text>
                  </Text>
                </View>

                {/* Input y Botón de Micrófono */}
                <View style={styles.interactionSection}>
                  <View style={[styles.inputRow, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
                    <TextInput
                      style={[styles.textInput, { color: colors.text }]}
                      placeholder="Escribí en romaji o kana..."
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
                  <TouchableOpacity
                    style={[
                      styles.micBtn,
                      {
                        backgroundColor: (isListening || autoVoiceMode) ? '#EF4444' : colors.surfaceHighlight,
                        borderColor: autoVoiceMode ? '#EF4444' : colors.border,
                        borderWidth: 1,
                      },
                    ]}
                    onPress={toggleVoiceListening}
                    onPressIn={handleVoicePressIn}
                    onPressOut={handleVoicePressOut}
                    activeOpacity={0.85}
                    disabled={hasEvaluated}
                  >
                    {/* Barra de progreso de carga al mantener presionado para modo automático */}
                    {!autoVoiceMode && (
                      <Animated.View
                        style={[
                          styles.micHoldProgress,
                          {
                            backgroundColor: colors.primary + '35',
                            width: holdProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: ['0%', '100%'],
                            }),
                          },
                        ]}
                      />
                    )}

                    <Ionicons
                      name={(isListening || autoVoiceMode) ? 'mic' : 'mic-outline'}
                      size={22}
                      color={(isListening || autoVoiceMode) ? '#FFF' : colors.text}
                    />
                    <View style={{ alignItems: 'flex-start' }}>
                      <Text
                        style={[
                          styles.micBtnText,
                          { color: (isListening || autoVoiceMode) ? '#FFF' : colors.text },
                        ]}
                      >
                        {(isListening || autoVoiceMode) ? 'Escuchando tu pronunciación...' : 'Responder por voz'}
                      </Text>
                      {!isListening && !autoVoiceMode && (
                        <Text style={[styles.micBtnSubtext, { color: colors.textMuted }]}>
                          Mantén presionado para modo automático
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Retroalimentación Flotante Fuera de la Tarjeta con Animación Suave */}
              {hasEvaluated && (
                <Animated.View
                  style={[
                    styles.feedbackBox,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isCorrect ? '#10B981' : colors.danger,
                      opacity: feedbackAnim,
                      transform: [
                        {
                          translateY: feedbackAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [10, 0],
                          }),
                        },
                      ],
                    },
                  ]}
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
                      {isCorrect ? '¡Excelente!' : 'Forma correcta:'}
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
                      style={[
                        styles.autoAdvanceFill,
                        {
                          backgroundColor: isCorrect ? '#10B981' : colors.primary,
                          width: autoNextProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                        },
                      ]}
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
                        Dominada
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                      onPress={handleNextWord}
                    >
                      <Text style={styles.nextBtnText}>Siguiente</Text>
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
              <Text style={[styles.menuDropdownTitle, { color: colors.textMuted }]}>Opciones de Conjugación</Text>

              <TouchableOpacity
                style={[styles.menuDropdownItem, { borderBottomColor: colors.border }]}
                onPress={openAddWordsModal}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={[styles.menuDropdownText, { color: colors.text, fontWeight: '600' }]}>Agregar palabras</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.menuDropdownItem, { borderBottomWidth: 0 }]}
                onPress={openRemoveWordsModal}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} style={{ marginRight: 10 }} />
                <Text style={[styles.menuDropdownText, { color: colors.danger, fontWeight: '600' }]}>Eliminar palabras</Text>
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
                  {deckName || 'Mazo'} <Text style={[styles.subtitle, { color: colors.textMuted }]}>- Agregar palabras</Text>
                </Text>
              </View>
            </View>

            {/* Lista de formas dominadas/inactivas para reactivar */}
            {rawWords.some((w) => (w.disabledConjugations?.length || 0) > 0) && (
              <View style={{ padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>
                  Conjugaciones dominadas
                </Text>
                <Text style={[styles.sectionHeaderSubtitle, { color: colors.textMuted }]}>
                  No se incluyen en la práctica.
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
                      const formLabel = FORM_LABELS[f as JapaneseConjugationForm] || f;
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
                        <Text style={[styles.removeWordBtnText, { color: colors.primary }]}>Estudiar</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
              </View>
            )}

            {loadingManagement ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: colors.textMuted }]}>Cargando palabras del mazo...</Text>
              </View>
            ) : availableWordsToAdd.length === 0 ? (
              <View style={styles.centerContainer}>
                <Ionicons name="checkmark-circle-outline" size={54} color="#10B981" />
                <Text style={[styles.noWordsTitle, { color: colors.text }]}>Todas las palabras agregadas</Text>
                <Text style={[styles.noWordsDesc, { color: colors.textMuted }]}>
                  Todos los verbos y adjetivos en forma base de tu mazo ya forman parte de la práctica de conjugaciones.
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
                      <Text style={styles.addWordBtnText}>Agregar</Text>
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
                  {deckName || 'Mazo'} <Text style={[styles.subtitle, { color: colors.textMuted }]}>- Eliminar palabras</Text>
                </Text>
              </View>
            </View>

            {rawWords.length === 0 ? (
              <View style={styles.centerContainer}>
                <Ionicons name="alert-circle-outline" size={54} color={colors.textMuted} />
                <Text style={[styles.noWordsTitle, { color: colors.text }]}>No hay palabras en práctica</Text>
                <Text style={[styles.noWordsDesc, { color: colors.textMuted }]}>
                  Agregá palabras desde el menú de opciones para ejercitar conjugaciones.
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
                      <Text style={[styles.removeWordBtnText, { color: colors.danger }]}>Quitar</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>
        </Modal>
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
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },
  targetPromptText: {
    fontSize: 16,
    textAlign: 'center',
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
    bottom: 0,
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
    borderWidth: 1,
    gap: 4,
    ...Shadows.card,
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
    height: '100%',
    borderRadius: 2,
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
