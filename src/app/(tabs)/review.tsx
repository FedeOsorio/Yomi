import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  type AppStateStatus,
  BackHandler,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Rating } from 'ts-fsrs';
import { speakText, stopSpeech } from '../../../lib/audio-service';
import { ALL_LANGUAGES, DeckWithStats, SUPPORTED_LANGUAGES } from '../../../lib/deck-service';
import { cleanAndFormatMeanings } from '../../../lib/japanese-search';
import { formatJapaneseReading, getEffectiveCardLanguage, toNormalizedHiragana } from '../../../lib/japanese-utils';
import { JLPT_KANJI_READINGS } from '../../../lib/jlpt-data';
import { calculateChineseAccuracyScore, PinyinBreakdownItem } from '../../../lib/pinyin-utils';
import { speechService } from '../../../lib/speech-recognition-service';
import {
  calculateReviewRating,
  checkMeaningMatch,
  checkReadingMatch,
  checkVoiceMatch,
  DueCardWithContext,
  formatSpokenTranscript,
  processCardReview,
  removeCardFromReview,
  rescheduleCardNextDay
} from '../../../lib/srs-engine';
import { getCompoundWordsForChar } from '../../../lib/word-service';
import { useTheme } from '../../../providers/ThemeProvider';
import { ReviewMethodModal } from '../../components/review/ReviewMethodModal';
import { ReviewTextInputSection } from '../../components/review/ReviewTextInputSection';
import { useTranslation } from '../../i18n';
import { SessionSummaryView } from '../../components/review/SessionSummaryView';
import { VoiceMicControl } from '../../components/review/VoiceMicControl';
import { VoiceTranscriptArea } from '../../components/review/VoiceTranscriptArea';
import { getFloatingTabBarStyle, Shadows, Spacing, Typography } from '../../constants/theme';
import { useReviewStore } from '../../stores/reviewStore';

const VOICE_TIMEOUT_SECONDS = 15;

interface DeckGridCardProps {
  item: DeckWithStats;
  colors: any;
  onPress: (id: string, name: string, hasDue: boolean) => void;
}

const DeckGridCard = memo(function DeckGridCard({
  item,
  colors,
  onPress,
}: DeckGridCardProps) {
  const isCustom = item.type === 'custom';
  const langMeta = ALL_LANGUAGES.find((l) => l.code === item.languageCode) || SUPPORTED_LANGUAGES[0];
  const dueCount = item.dueCount || 0;
  const cardsInReview = item.activeCardsCount !== undefined ? item.activeCardsCount : (item.wordCount || 0);
  const hasDue = dueCount > 0;

  return (
    <TouchableOpacity
      style={[
        styles.gridCard,
        {
          backgroundColor: colors.surface,
          borderColor: hasDue ? (isCustom ? '#10B981' : colors.primary) : colors.border,
        },
      ]}
      activeOpacity={0.75}
      onPress={() => onPress(item.id, item.name, hasDue)}
    >
      <View style={styles.gridCardTopRow}>
        <View
          style={[
            styles.gridFlagCircle,
            {
              backgroundColor: isCustom
                ? 'rgba(16, 185, 129, 0.15)'
                : 'rgba(59, 130, 246, 0.15)',
            },
          ]}
        >
          {isCustom ? (
            <Ionicons
              name="layers"
              size={20}
              color="#10B981"
            />
          ) : (
            <Text style={styles.gridFlagEmoji}>{langMeta.flag}</Text>
          )}
        </View>

        {hasDue ? (
          <View
            style={[
              styles.gridDueBadge,
              {
                backgroundColor: isCustom
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(59, 130, 246, 0.15)',
                borderColor: isCustom
                  ? 'rgba(16, 185, 129, 0.35)'
                  : 'rgba(59, 130, 246, 0.35)',
              },
            ]}
          >
            <Text
              style={[
                styles.gridDueBadgeText,
                { color: isCustom ? '#10B981' : colors.primary },
              ]}
            >
              {dueCount} hoy
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.gridDueBadge,
              {
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                borderColor: 'rgba(16, 185, 129, 0.25)',
              },
            ]}
          >
            <Text style={[styles.gridDueBadgeText, { color: '#10B981' }]}>
              Al día
            </Text>
          </View>
        )}
      </View>

      <View style={styles.gridCardBody}>
        <Text style={[styles.gridCardTitle, { color: colors.text }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.gridCardSub, { color: colors.textMuted }]} numberOfLines={1}>
          {isCustom ? 'Personalizado' : (langMeta?.label || 'General')} • {cardsInReview}{' '}
          {cardsInReview === 1 ? (isCustom ? 'tarjeta' : 'palabra') : (isCustom ? 'tarjetas' : 'palabras')}
        </Text>
      </View>

      <View style={[styles.gridCardFooter, { borderTopColor: colors.border }]}>
        <Text
          style={[
            styles.gridCardActionText,
            { color: hasDue ? (isCustom ? '#10B981' : colors.primary) : colors.textMuted },
          ]}
        >
          {hasDue ? 'Repasar ahora' : 'Practicar'}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={hasDue ? (isCustom ? '#10B981' : colors.primary) : colors.textMuted}
        />
      </View>
    </TouchableOpacity>
  );
});

interface SyllableBreakdownViewProps {
  breakdown: PinyinBreakdownItem[];
  colors: any;
}

const SyllableBreakdownView = memo(function SyllableBreakdownView({
  breakdown,
  colors,
}: SyllableBreakdownViewProps) {
  return (
    <View style={styles.breakdownContainer}>
      <Text style={[styles.breakdownSectionTitle, { color: colors.textMuted }]}>
        Precisión por Sílaba
      </Text>

      <View style={styles.syllablesRow}>
        {breakdown.map((item, bIndex) => {
          const sylScore = Math.min(Math.max(item.score, 0), 100);
          const strokeColor =
            sylScore >= 90 ? '#10B981' : sylScore >= 70 ? '#F59E0B' : colors.danger;
          const circRadius = 15.5;
          const circPerimeter = 2 * Math.PI * circRadius;
          const strokeDashoffset = circPerimeter - (circPerimeter * sylScore) / 100;

          return (
            <View
              key={bIndex}
              style={[
                styles.syllableCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.syllableHeader}>
                {item.char ? (
                  <Text style={[styles.syllableChar, { color: colors.text }]}>
                    {item.char}
                  </Text>
                ) : null}
                <Text style={[styles.syllableText, { color: colors.primary }]}>
                  {item.syllable}
                </Text>
              </View>

              {/* Círculo de porcentaje SVG */}
              <View style={styles.circleBox}>
                <Svg width={38} height={38} viewBox="0 0 38 38">
                  {/* Círculo de fondo tenue */}
                  <Circle
                    cx="19"
                    cy="19"
                    r={circRadius}
                    stroke={colors.border}
                    strokeWidth="3"
                    fill="transparent"
                  />
                  {/* Círculo de progreso animado/llenado */}
                  <Circle
                    cx="19"
                    cy="19"
                    r={circRadius}
                    stroke={strokeColor}
                    strokeWidth="3"
                    strokeDasharray={`${circPerimeter}`}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="transparent"
                    transform="rotate(-90 19 19)"
                  />
                </Svg>
                <View style={styles.circleScoreTextContainer}>
                  <Text style={[styles.circleScoreNumber, { color: strokeColor }]}>
                    {sylScore}%
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
});

export default function ReviewScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { deckId: paramDeckId } = useLocalSearchParams<{ deckId?: string }>();

  // Estados y acciones desde reviewStore
  const decksList = useReviewStore((s) => s.decksList);
  const selectedDeckId = useReviewStore((s) => s.selectedDeckId);
  const selectedDeckName = useReviewStore((s) => s.selectedDeckName);
  const studyMethod = useReviewStore((s) => s.studyMethod);
  const isPracticeMode = useReviewStore((s) => s.isPracticeMode);
  const showMethodModal = useReviewStore((s) => s.showMethodModal);
  const pendingSelection = useReviewStore((s) => s.pendingSelection);

  const dueCards = useReviewStore((s) => s.dueCards);
  const currentIndex = useReviewStore((s) => s.currentIndex);
  const loading = useReviewStore((s) => s.loading);
  const isProcessing = useReviewStore((s) => s.isProcessing);
  const sessionCompleted = useReviewStore((s) => s.sessionCompleted);
  const sessionCount = useReviewStore((s) => s.sessionCount);

  const isChecked = useReviewStore((s) => s.isChecked);
  const evaluation = useReviewStore((s) => s.evaluation);
  const currentCompoundWords = useReviewStore((s) => s.currentCompoundWords);

  const isListening = useReviewStore((s) => s.isListening);
  const speechStatus = useReviewStore((s) => s.speechStatus);

  const fetchDecksData = useReviewStore((s) => s.fetchDecksData);
  const promptStudyMethod = useReviewStore((s) => s.promptStudyMethod);
  const setShowMethodModal = useReviewStore((s) => s.setShowMethodModal);
  const startSession = useReviewStore((s) => s.startSession);
  const exitSession = useReviewStore((s) => s.exitSession);
  const setIsChecked = useReviewStore((s) => s.setIsChecked);
  const setEvaluation = useReviewStore((s) => s.setEvaluation);
  const setCurrentCompoundWords = useReviewStore((s) => s.setCurrentCompoundWords);
  const setIsListening = useReviewStore((s) => s.setIsListening);
  const setSpeechTranscript = useReviewStore((s) => s.setSpeechTranscript);
  const setSpeechStatus = useReviewStore((s) => s.setSpeechStatus);
  const setIsProcessing = useReviewStore((s) => s.setIsProcessing);
  const recordFailedCard = useReviewStore((s) => s.recordFailedCard);
  const resetCurrentCardForm = useReviewStore((s) => s.resetCurrentCardForm);
  const advanceCard = useReviewStore((s) => s.advanceCard);
  const reinsertCurrentCardAhead = useReviewStore((s) => s.reinsertCurrentCardAhead);
  const reinsertCurrentCardAtEnd = useReviewStore((s) => s.reinsertCurrentCardAtEnd);

  // Control de timers y animación de voz
  const autoTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isCardEvaluatedRef = useRef<boolean>(false);
  const accumulatedSpeechRef = useRef<string>('');
  const voiceProgressAnim = useRef(new Animated.Value(0)).current;
  const micPulseAnim = useRef(new Animated.Value(1)).current;
  const cardFlipAnim = useRef(new Animated.Value(0)).current;
  const flipCountdownAnim = useRef(new Animated.Value(1)).current;
  const flipCountdownDurationRef = useRef<number>(7000);
  const flipCountdownStartTimeRef = useRef<number>(0);
  const flipCountdownRemainingRef = useRef<number>(7000);
  const isCountdownPausedRef = useRef<boolean>(false);
  const restartAttemptsRef = useRef<number>(0);

  // Estilos de animación 3D optimizados para 60 FPS continuos con backfaceVisibility
  const frontAnimatedStyle = useMemo(() => ({
    backfaceVisibility: 'hidden' as const,
    opacity: cardFlipAnim.interpolate({
      inputRange: [0, 0.49, 0.5, 1],
      outputRange: [1, 1, 0, 0],
    }),
    transform: [
      { perspective: 1000 },
      {
        rotateY: cardFlipAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '180deg'],
        }),
      },
    ],
  }), [cardFlipAnim]);

  const backAnimatedStyle = useMemo(() => ({
    backfaceVisibility: 'hidden' as const,
    opacity: cardFlipAnim.interpolate({
      inputRange: [0, 0.5, 0.51, 1],
      outputRange: [0, 0, 1, 1],
    }),
    transform: [
      { perspective: 1000 },
      {
        rotateY: cardFlipAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ['180deg', '360deg'],
        }),
      },
    ],
  }), [cardFlipAnim]);

  // Ocultar la barra de pestañas (tab bar) durante la sesión activa de estudio y restaurarla fielmente con estilo flotante
  useEffect(() => {
    const defaultTabBarStyle = getFloatingTabBarStyle(colors, insets.bottom);
    if (selectedDeckId) {
      navigation.setOptions({
        tabBarStyle: { display: 'none' },
      });
    } else {
      navigation.setOptions({
        tabBarStyle: defaultTabBarStyle,
      });
    }
    return () => {
      navigation.setOptions({
        tabBarStyle: defaultTabBarStyle,
      });
    };
  }, [selectedDeckId, navigation, colors, insets.bottom]);

  // Interceptar el botón de retroceso de Android: si hay sesión activa, salir en lugar de navegar
  useEffect(() => {
    const onBackPress = () => {
      if (selectedDeckId) {
        handleExitSession();
        return true; // Consumir el evento, no navegar
      }
      return false; // Dejar que la navegación normal ocurra
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [selectedDeckId]);

  // Pausar y liberar el micrófono si la app pasa a segundo plano (llamada, minimizar, bloquear pantalla)
  useEffect(() => {
    speechService.checkPermissions().catch(() => { });
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        stopSpeech();
        speechService.abort().catch(() => { });
        setIsListening(false);
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, []);

  // Mantener la pantalla encendida ÚNICAMENTE durante el repaso continuo por voz (manos libres)
  useEffect(() => {
    const isVoiceSessionActive = Boolean(selectedDeckId && studyMethod === 'voice' && !sessionCompleted);
    const KEEP_AWAKE_TAG = 'yomi_voice_review';

    if (isVoiceSessionActive) {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    } else {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    }

    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [selectedDeckId, studyMethod, sessionCompleted]);

  // Al perder el foco (p. ej. al cambiar de pestaña o salir de la pantalla), detener el micrófono y limpiar la sesión
  useFocusEffect(
    useCallback(() => {
      return () => {
        stopSpeech();
        if (autoTimerRef.current) {
          clearTimeout(autoTimerRef.current);
          autoTimerRef.current = null;
        }
        isCardEvaluatedRef.current = true;
        speechService.stop();
        setIsListening(false);
        setSpeechStatus('idle');
      };
    }, [])
  );

  // Efecto orgánico de pulsación/respiración para el halo flotante del micrófono
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (isListening) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(micPulseAnim, {
            toValue: 1.07,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(micPulseAnim, {
            toValue: 1.0,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      micPulseAnim.setValue(1);
    }
    return () => {
      if (animation) animation.stop();
    };
  }, [isListening]);

  // Sincronizar el botón de salir/volver en el header superior nativo
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => null,
      headerTitle: () => (
        <View style={styles.headerTitleRow}>
          {selectedDeckId ? (
            <TouchableOpacity
              onPress={handleExitSession}
              style={styles.headerBackBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : null}
          <Text style={[styles.headerBrandText, { color: colors.primary }]}>Yomi</Text>
          <Text style={[styles.headerBrandSep, { color: colors.textMuted }]}> • </Text>
          <Text style={[styles.headerSubtitleText, { color: colors.text }]} numberOfLines={1}>
            {selectedDeckId ? (selectedDeckName || 'Repaso') : 'Repaso SRS'}
          </Text>
        </View>
      ),
    });
  }, [selectedDeckId, selectedDeckName, colors]);

  const handleSelectMethod = (method: 'text' | 'voice') => {
    if (!pendingSelection) return;
    const { deckId, deckName, hasDue } = pendingSelection;
    setShowMethodModal(false);
    // Margen para que el modal nativo termine de desmontarse antes de arrancar la sesión
    setTimeout(() => {
      handleStartSession(deckId, deckName, method, !hasDue);
    }, 200);
  };

  // Inicia la sesión para un mazo específico o para todos los mazos ('all')
  const handleStartSession = async (
    deckId: string | 'all',
    deckName: string,
    method: 'text' | 'voice' = 'text',
    practiceMode: boolean = false
  ) => {
    resetForm();
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }

    await startSession(deckId, deckName, method, practiceMode);
    const cards = useReviewStore.getState().dueCards;

    // Si es modo voz y hay tarjetas, iniciamos el reconocimiento en la primera tarjeta
    // asegurando que la pantalla de repaso y el foco de audio estén completamente activos
    if (method === 'voice' && cards.length > 0) {
      const firstCard = cards[0];
      const lang = getEffectiveCardLanguage(firstCard);
      setTimeout(() => {
        startVoiceListeningForCard(firstCard, lang);
      }, 150);
    }
  };

  // Extrae strings contextuales para sesgar el reconocedor de voz nativo hacia la tarjeta actual
  const getCardContextualStrings = (card: DueCardWithContext, lang: string): string[] => {
    const strings: string[] = [];
    if (card.displayText) strings.push(card.displayText.trim());
    if (card.displayReading) {
      strings.push(card.displayReading.trim());
      card.displayReading.split(/[\/\n,、;•|]/).forEach((p) => {
        const clean = p.replace(/^(on|kun|音|訓)[:：\s]*/i, '').trim();
        if (clean) strings.push(clean);
      });
    }
    if (card.auxiliaryInfo) {
      try {
        const aux = JSON.parse(card.auxiliaryInfo);
        if (aux.kanjiReadings) {
          aux.kanjiReadings.split(/[\/\n,、;•|]/).forEach((p: string) => {
            const clean = p.replace(/^(on|kun|音|訓)[:：\s]*/i, '').trim();
            if (clean) strings.push(clean);
          });
        }
        if (aux.onReading) {
          aux.onReading.split(/[,、\s]+/).forEach((p: string) => {
            const clean = p.trim();
            if (clean) strings.push(clean);
          });
        }
        if (aux.kunReading) {
          aux.kunReading.split(/[,、\s]+/).forEach((p: string) => {
            const clean = p.trim();
            if (clean) strings.push(clean);
          });
        }
      } catch { }
    }

    const effectiveLang = getEffectiveCardLanguage(card);
    const isJapanese = effectiveLang.toLowerCase().startsWith('ja');
    if (isJapanese) {
      const extraVariants: string[] = [];
      strings.forEach((str) => {
        const hira = toNormalizedHiragana(str);
        if (hira && !strings.includes(hira)) extraVariants.push(hira);
        // Generar Katakana para ampliar reconocimiento fonético
        const kata = hira.replace(/[\u3041-\u3096]/g, (ch) =>
          String.fromCharCode(ch.charCodeAt(0) + 0x60)
        );
        if (kata && !strings.includes(kata)) extraVariants.push(kata);
      });

      // Si es un kanji o palabra común, agregar variantes fonéticas directas (romaji y números)
      const kanjiChar = (card.displayText || '').trim();
      if (JLPT_KANJI_READINGS[kanjiChar]) {
        const entry = JLPT_KANJI_READINGS[kanjiChar];
        if (entry.on) {
          entry.on.split(/[,、\s]+/).forEach((p) => {
            const clean = p.trim();
            if (clean) extraVariants.push(clean, toNormalizedHiragana(clean));
          });
        }
        if (entry.kun) {
          entry.kun.split(/[,、\s]+/).forEach((p) => {
            const clean = p.replace(/[・~～\s\(\)（）\-\.]/g, '').trim();
            if (clean) extraVariants.push(clean, toNormalizedHiragana(clean));
          });
        }
        if (entry.essential) {
          extraVariants.push(entry.essential, toNormalizedHiragana(entry.essential));
        }
      }

      if (card.displayText === '時' || card.displayReading?.includes('とき') || card.displayReading?.includes('じ')) {
        extraVariants.push('とき', 'じ', '時', 'toki', 'ji');
      }
      if (card.displayText === '上' || card.displayReading?.includes('うえ')) {
        extraVariants.push('うえ', '上', 'ue');
      }
      if (card.displayText === '千' || card.displayReading?.includes('せん')) {
        extraVariants.push('せん', '1000', 'sen');
      }
      if (card.displayText === '週' || card.displayReading?.includes('しゅう')) {
        extraVariants.push('しゅう', 'シュー', 'shuu');
      }
      if (card.displayText === '多' || card.displayText === '多い' || card.displayReading?.includes('おおい')) {
        extraVariants.push('おおい', 'オーイ', 'ooi', 'o-i');
      }
      if (card.displayText === '口' || card.displayReading?.includes('くち')) {
        extraVariants.push('くち', 'クチ', '口', 'kuchi');
      }
      if (card.displayText === '耳' || card.displayReading?.includes('みみ')) {
        extraVariants.push('みみ', 'ミミ', '耳', 'mimi');
      }
      if (card.displayText === '目' || card.displayReading?.includes('め')) {
        extraVariants.push('め', 'メ', '目', 'me');
      }
      if (card.displayText === '手' || card.displayReading?.includes('て')) {
        extraVariants.push('て', 'テ', '手', 'te');
      }
      if (card.displayText === '足' || card.displayReading?.includes('あし')) {
        extraVariants.push('あし', 'アシ', '足', 'ashi');
      }

      strings.push(...extraVariants);
    }
    return Array.from(new Set(strings.filter(Boolean)));
  };

  // Ciclo continuo de escucha con el micrófono con temporizador de 15 segundos sincronizado al inicio real
  const startVoiceListeningForCard = async (card: DueCardWithContext, lang: string) => {
    stopSpeech();
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    voiceProgressAnim.stopAnimation();
    voiceProgressAnim.setValue(0);
    cardFlipAnim.setValue(0);

    isCardEvaluatedRef.current = false;
    restartAttemptsRef.current = 0;
    accumulatedSpeechRef.current = '';
    setSpeechTranscript('');
    setSpeechStatus('listening');
    setIsListening(true);

    let isTimerStarted = false;
    let startTime = 0;

    const startTimerCountdown = () => {
      if (isTimerStarted || isCardEvaluatedRef.current) return;
      isTimerStarted = true;
      startTime = Date.now();

      voiceProgressAnim.stopAnimation();
      voiceProgressAnim.setValue(0);
      Animated.timing(voiceProgressAnim, {
        toValue: 1,
        duration: VOICE_TIMEOUT_SECONDS * 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished && !isCardEvaluatedRef.current) {
          isCardEvaluatedRef.current = true;
          speechService.abort().catch(() => { });
          setIsListening(false);
          handleVoiceEvaluation(card, false);
        }
      });
    };

    // Fallback de seguridad: si el evento onStart del micrófono tarda más de 1200ms, arrancar el temporizador
    const fallbackTimer = setTimeout(() => {
      startTimerCountdown();
    }, 1200);

    let restartTimer: NodeJS.Timeout | null = null;
    const scheduleRestart = () => {
      if (isCardEvaluatedRef.current) return;
      const currentElapsed = startTime > 0 ? (Date.now() - startTime) / 1000 : 0;
      // Si el micrófono aún no ha arrancado (fase de inicio inicial), reintentar progresivamente
      if (startTime === 0 && restartAttemptsRef.current < 4) {
        if (restartTimer) clearTimeout(restartTimer);
        restartAttemptsRef.current += 1;
        restartTimer = setTimeout(async () => {
          if (!isCardEvaluatedRef.current) {
            await speechService.abort();
            await initRecognizer();
          }
        }, 350 * restartAttemptsRef.current);
        return;
      }

      if (currentElapsed < VOICE_TIMEOUT_SECONDS - 1.0 && restartAttemptsRef.current < 5) {
        if (restartTimer) clearTimeout(restartTimer);
        restartTimer = setTimeout(async () => {
          if (!isCardEvaluatedRef.current) {
            restartAttemptsRef.current += 1;
            await speechService.abort();
            await initRecognizer();
          }
        }, 300);
      } else {
        setIsListening(false);
      }
    };

    const initRecognizer = async () => {
      if (isCardEvaluatedRef.current) return;
      if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
      }

      const contextualStrings = getCardContextualStrings(card, lang);

      await speechService.start(
        lang,
        {
          onStart: () => {
            if (!isCardEvaluatedRef.current) {
              clearTimeout(fallbackTimer);
              startTimerCountdown();
              setIsListening(true);
              setSpeechStatus('listening');
            }
          },
          onResult: (transcript, isFinal, alternatives) => {
            if (isCardEvaluatedRef.current) return;
            const currentTrimmed = transcript.trim();
            if (!currentTrimmed && (!alternatives || alternatives.length === 0)) return;

            // Formatear y mostrar de inmediato exactamente lo que se está diciendo en este intento
            const formatted = formatSpokenTranscript(currentTrimmed, lang);
            if (formatted) {
              setSpeechTranscript(formatted);
            }

            // Recolectar todas las hipótesis candidatas para evaluación en tiempo real
            const candidateHypotheses = [
              currentTrimmed,
              ...(alternatives || []),
            ].filter(Boolean);

            let matchedHypo = '';
            const isMatch = candidateHypotheses.some((hypo) => {
              if (checkVoiceMatch(card, hypo, lang)) {
                matchedHypo = hypo;
                return true;
              }
              return false;
            });

            if (isMatch) {
              // Cortar el micrófono inmediatamente en cuanto se detecta la coincidencia
              isCardEvaluatedRef.current = true;
              speechService.abort().catch(() => { });
              setIsListening(false);
              setSpeechStatus('evaluating');
              const matchedFormatted = formatSpokenTranscript(matchedHypo || currentTrimmed, lang);
              setSpeechTranscript(matchedFormatted);
              // Breve pausa para apreciar en verde la pronunciación antes de la rotación 3D
              setTimeout(() => {
                handleVoiceEvaluation(card, true, matchedHypo || currentTrimmed);
              }, 400);
            }
          },
          onError: (err) => {
            if (err === 'aborted' || isCardEvaluatedRef.current) return;
            scheduleRestart();
          },
          onEnd: () => {
            if (isCardEvaluatedRef.current) return;
            scheduleRestart();
          },
        },
        {
          contextualStrings,
          maxAlternatives: 10,
        }
      );
    };

    await initRecognizer();
  };

  // Evaluación y feedback de voz con avance continuo y Flip 3D (tanto acierto como fallo)
  const handleVoiceEvaluation = async (
    card: DueCardWithContext,
    isSuccess: boolean,
    directTranscript?: string
  ) => {
    isCardEvaluatedRef.current = true;
    voiceProgressAnim.stopAnimation();

    // Abortar el micrófono inmediatamente en segundo plano para liberar el hilo de render y empezar el giro sin lag
    speechService.abort().catch(() => { });
    setIsListening(false);
    setSpeechStatus(isSuccess ? 'correct' : 'incorrect');
    setIsChecked(true);

    const lang = getEffectiveCardLanguage(card);
    let voiceScore: { score: number; label: string; breakdown?: PinyinBreakdownItem[] } | undefined;

    // La precisión fonética con desglose de tonos se calcula exclusivamente para Chino (Pinyin)
    // En japonés, el reconocimiento ASR estándar no mide acento tonal (pitch accent), por lo que se omite el badge
    if (lang.startsWith('zh')) {
      const recognized = directTranscript || useReviewStore.getState().speechTranscript || accumulatedSpeechRef.current || '';
      const res = calculateChineseAccuracyScore(recognized, card.displayText, card.displayReading);
      voiceScore = { score: res.score, label: res.label, breakdown: res.breakdown };
    }

    const rating = isSuccess ? Rating.Good : Rating.Again;
    setEvaluation({
      isReadingCorrect: isSuccess,
      isMeaningCorrect: isSuccess,
      computedRating: rating,
      voiceScore,
    });

    // Si falló (tiempo agotado o pronunciación errónea), registrar fallo de sesión y reinsertar en la cola
    if (!isSuccess) {
      recordFailedCard(card.id);
      reinsertCurrentCardAhead(5, 10);
    }

    // La tarjeta SIEMPRE se da vuelta con animación 3D nativa fluida a 60 FPS
    Animated.timing(cardFlipAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        // Reproducir audio TTS y arrancar temporizador de 7s recién cuando la tarjeta completó el giro
        speakText(card.displayText, lang, card.displayReading);
        startCountdownTimer(7000);
      }
    });

    // Desacoplar la escritura SQLite FSRS para no bloquear el hilo de render durante la rotación 3D
    if (!isPracticeMode) {
      const wasFailedInSession = useReviewStore.getState().sessionFailedCardIds.has(card.id);

      if (!isSuccess) {
        // Fallo: suma a reps, incrementa lapsos y fija el repaso para mañana
        setTimeout(() => {
          processCardReview(card.id, Rating.Again).catch((err) => {
            console.warn('Error al procesar FSRS:', err);
          });
        }, 350);
      } else {
        // Acierto: suma a reps por la intervención del usuario.
        // Si ya había fallado en esta sesión, wasFailedInSession asegura que no salte a 3 días y quede para mañana.
        setTimeout(() => {
          processCardReview(card.id, Rating.Good, { wasFailedInSession }).catch((err) => {
            console.warn('Error al procesar FSRS:', err);
          });
        }, 350);
      }
    }
  };

  const startCountdownTimer = (durationMs: number) => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    flipCountdownAnim.stopAnimation();
    flipCountdownAnim.setValue(0);
    flipCountdownDurationRef.current = durationMs;
    flipCountdownRemainingRef.current = durationMs;
    flipCountdownStartTimeRef.current = Date.now();
    isCountdownPausedRef.current = false;

    Animated.timing(flipCountdownAnim, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

    autoTimerRef.current = setTimeout(() => {
      advanceToNextVoiceCard();
    }, durationMs);
  };

  const pauseCountdownTimer = () => {
    if (!isChecked || isCountdownPausedRef.current) return;
    isCountdownPausedRef.current = true;
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    // Detener la animación en el progreso actual y calcular el tiempo restante
    flipCountdownAnim.stopAnimation((currentValue) => {
      const elapsed = Date.now() - flipCountdownStartTimeRef.current;
      const remaining = Math.max(flipCountdownDurationRef.current - elapsed, 500);
      flipCountdownRemainingRef.current = remaining;
      flipCountdownAnim.setValue(currentValue);
    });
  };

  const resumeCountdownTimer = () => {
    if (!isChecked || !isCountdownPausedRef.current) return;
    isCountdownPausedRef.current = false;
    const remainingMs = flipCountdownRemainingRef.current;
    flipCountdownStartTimeRef.current = Date.now();
    flipCountdownDurationRef.current = remainingMs;

    Animated.timing(flipCountdownAnim, {
      toValue: 1,
      duration: remainingMs,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

    autoTimerRef.current = setTimeout(() => {
      advanceToNextVoiceCard();
    }, remainingMs);
  };

  // Pase automático o manual a la siguiente tarjeta en modo voz con transición fluida 3D
  const advanceToNextVoiceCard = () => {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    isCountdownPausedRef.current = false;
    flipCountdownAnim.stopAnimation();
    flipCountdownAnim.setValue(0);
    // Detener cualquier reproducción TTS activa y limpiar transcripciones
    stopSpeech();
    setSpeechTranscript('');
    accumulatedSpeechRef.current = '';

    // Rotar la tarjeta suavemente de regreso al frente a 60 FPS
    Animated.timing(cardFlipAnim, {
      toValue: 0,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        // En cuanto la animación 3D termina y la nueva tarjeta está 100% visible de frente,
        // la nueva palabra activa el micrófono directamente sin pausas estimativas
        const nextCard = useReviewStore.getState().getCurrentCard();
        if (nextCard) {
          const lang = getEffectiveCardLanguage(nextCard);
          startVoiceListeningForCard(nextCard, lang);
        } else {
          speechService.abort().catch(() => { });
          setIsListening(false);
          setSpeechStatus('idle');
        }
      }
    });

    // En el punto medio de la rotación (150ms, cuando está de perfil e invisible), actualizar el contenido
    setTimeout(() => {
      advanceCard();
    }, 150);
  };

  // Salir de la sesión actual y volver al selector de mazos
  const handleExitSession = () => {
    stopSpeech();
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    isCardEvaluatedRef.current = true;
    voiceProgressAnim.stopAnimation();
    voiceProgressAnim.setValue(0);
    flipCountdownAnim.stopAnimation();
    flipCountdownAnim.setValue(0);
    cardFlipAnim.setValue(0);
    speechService.abort().catch(() => { });
    setSpeechTranscript('');
    accumulatedSpeechRef.current = '';
    exitSession();
    fetchDecksData();
  };

  const resetForm = () => {
    resetCurrentCardForm();
    cardFlipAnim.setValue(0);
  };

  useFocusEffect(
    useCallback(() => {
      if (paramDeckId) {
        // Si se abrió con un deckId específico por parámetro de navegación
        (async () => {
          try {
            await fetchDecksData();
            const currentDecks = useReviewStore.getState().decksList;
            const deck = currentDecks.find((item) => item.id === paramDeckId);
            const deckName = deck ? deck.name : 'Mazo';
            const hasDue = (deck?.dueCount || 0) > 0;
            handleStartSession(paramDeckId, deckName, 'text', !hasDue);
          } catch (e) {
            console.warn('Error al iniciar sesión con paramDeckId:', e);
            fetchDecksData();
          }
        })();
      } else {
        fetchDecksData();
      }
    }, [paramDeckId])
  );

  const currentCard = dueCards[currentIndex] || null;

  // Resolver prioritariamente los significados seleccionados por el usuario para esta palabra (memoizado para 60 FPS)
  const meaningsList = useMemo(() => {
    if (!currentCard) return [];
    let list: string[] = [];

    // 1. Prioridad: Si la palabra tiene auxiliaryInfo con selectedMeanings guardados
    if (currentCard.auxiliaryInfo) {
      try {
        const aux = JSON.parse(currentCard.auxiliaryInfo);
        if (Array.isArray(aux.selectedMeanings) && aux.selectedMeanings.length > 0) {
          list = aux.selectedMeanings.map((m: string) => String(m).trim()).filter(Boolean);
        }
      } catch (e) { }
    }

    // 2. Si displayMeaning contiene la lista personalizada
    if (list.length === 0 && currentCard.displayMeaning) {
      try {
        const parsed = JSON.parse(currentCard.displayMeaning);
        if (Array.isArray(parsed) && parsed.length > 0) {
          list = parsed.map((m: string) => String(m).trim()).filter(Boolean);
        } else if (typeof parsed === 'string' && parsed.trim().length > 0) {
          list = [parsed.trim()];
        }
      } catch {
        const raw = String(currentCard.displayMeaning).trim();
        if (raw.length > 0) {
          list = [raw];
        }
      }
    }

    // 3. Si no hay selección personalizada, limpiar y formatear wordMeanings
    if (list.length === 0 && currentCard.wordMeanings) {
      if (currentCard.deckType === 'custom') {
        try {
          const parsed = JSON.parse(currentCard.wordMeanings);
          list = Array.isArray(parsed) ? parsed : [String(currentCard.wordMeanings)];
        } catch {
          list = [currentCard.wordMeanings];
        }
      } else {
        list = cleanAndFormatMeanings(currentCard.wordMeanings);
      }
    }

    return list;
  }, [currentCard?.id, currentCard?.auxiliaryInfo, currentCard?.displayMeaning, currentCard?.wordMeanings]);

  // Cargar palabras compuestas de ejemplo para la tarjeta actual
  useEffect(() => {
    let isMounted = true;
    if (currentCard) {
      const lang = getEffectiveCardLanguage(currentCard);
      const isIdeographic = lang.startsWith('zh') || lang.startsWith('ja');
      if (isIdeographic) {
        getCompoundWordsForChar(currentCard.displayText, 2).then((res) => {
          if (isMounted) setCurrentCompoundWords(res);
        });
      } else {
        setCurrentCompoundWords([]);
      }
    }
    return () => {
      isMounted = false;
    };
  }, [currentCard]);

  // Reproducción automática del audio de la pregunta al presentar una tarjeta de mazo personalizado
  useEffect(() => {
    if (currentCard && !isChecked && !sessionCompleted) {
      const isCustom =
        currentCard.deckType === 'custom' ||
        currentCard.languageCode === 'custom' ||
        currentCard.languageCode === 'es-ES';
      if (isCustom) {
        const timer = setTimeout(() => {
          speakText(currentCard.displayText, 'es-ES');
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [currentCard?.id, isChecked, sessionCompleted]);

  const handleSpeak = () => {
    if (!currentCard) return;
    const lang = getEffectiveCardLanguage(currentCard);
    speakText(currentCard.displayText, lang, currentCard.displayReading);
  };

  // 1. Comprobar respuestas escritas
  const handleCheck = () => {
    if (!currentCard) return;

    const lang = getEffectiveCardLanguage(currentCard);
    const isIdeographic = lang.startsWith('zh') || lang.startsWith('ja');

    let activeTargetMeanings = currentCard.displayMeaning;
    if (currentCard.auxiliaryInfo) {
      try {
        const aux = JSON.parse(currentCard.auxiliaryInfo);
        if (Array.isArray(aux.selectedMeanings) && aux.selectedMeanings.length > 0) {
          activeTargetMeanings = JSON.stringify(aux.selectedMeanings);
        }
      } catch (e) { }
    }

    let altKanjiReadings: string | undefined;
    if (currentCard.auxiliaryInfo) {
      try {
        const aux = JSON.parse(currentCard.auxiliaryInfo);
        if (aux.kanjiReadings) altKanjiReadings = aux.kanjiReadings;
      } catch { }
    }

    const isJapanese = lang.startsWith('ja');
    const kanjiChar = (currentCard.displayText || '').trim();
    if (isJapanese && JLPT_KANJI_READINGS[kanjiChar]) {
      const entry = JLPT_KANJI_READINGS[kanjiChar];
      const jlptReadings = [entry.essential, entry.on, entry.kun].filter(Boolean).join(' • ');
      altKanjiReadings = altKanjiReadings ? `${altKanjiReadings} • ${jlptReadings}` : jlptReadings;
    }

    const { inputReading, inputMeaning } = useReviewStore.getState();

    const isReadingCorrect = isIdeographic
      ? (checkReadingMatch(currentCard.displayReading, inputReading) ||
        (altKanjiReadings ? checkReadingMatch(altKanjiReadings, inputReading) : false))
      : true;

    const isMeaningCorrect = checkMeaningMatch(activeTargetMeanings, inputMeaning);
    const computedRating = calculateReviewRating(isReadingCorrect, isMeaningCorrect, isIdeographic);

    let voiceScore: { score: number; label: string; breakdown?: PinyinBreakdownItem[] } | undefined;
    if (lang.startsWith('zh') && inputReading) {
      const res = calculateChineseAccuracyScore(inputReading, currentCard.displayText, currentCard.displayReading);
      voiceScore = { score: res.score, label: res.label, breakdown: res.breakdown };
    }

    setEvaluation({
      isReadingCorrect,
      isMeaningCorrect,
      computedRating,
      voiceScore,
    });
    setIsChecked(true);
    Animated.timing(cardFlipAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        handleSpeak();
      }
    });
  };

  // 2. No me acuerdo (fallo manual)
  const handleGiveUp = () => {
    if (!currentCard) return;
    setEvaluation({
      isReadingCorrect: false,
      isMeaningCorrect: false,
      computedRating: Rating.Again,
    });
    setIsChecked(true);
    Animated.timing(cardFlipAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        handleSpeak();
      }
    });
  };

  // 3. Avanzar a la siguiente tarjeta (modo clásico por teclado)
  const handleNextCard = async () => {
    if (!currentCard || isProcessing) return;
    setIsProcessing(true);
    stopSpeech();

    try {
      const isAgain = evaluation?.computedRating === Rating.Again;
      const wasFailedInSession = useReviewStore.getState().sessionFailedCardIds.has(currentCard.id);

      if (isAgain) {
        recordFailedCard(currentCard.id);
      }

      if (!isPracticeMode && evaluation) {
        if (isAgain) {
          await processCardReview(currentCard.id, Rating.Again);
        } else {
          await processCardReview(currentCard.id, evaluation.computedRating, { wasFailedInSession });
        }
      }

      // Si la tarjeta fue fallada o se presionó "No lo sé", reinsertar entre 5 y 10 posiciones adelante
      if (isAgain) {
        reinsertCurrentCardAhead(5, 10);
      }

      // Rotar suavemente la tarjeta de regreso al frente a 60 FPS
      Animated.timing(cardFlipAnim, {
        toValue: 0,
        duration: 260,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setIsProcessing(false);
      });

      // En el punto medio de la rotación (130ms), avanzar el estado
      setTimeout(() => {
        advanceCard();
      }, 130);
    } catch (e) {
      console.error('Error al guardar repaso FSRS:', e);
      Animated.timing(cardFlipAnim, {
        toValue: 0,
        duration: 260,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setIsProcessing(false);
      });
      setTimeout(() => {
        advanceCard();
      }, 130);
    }
  };

  // 4. Mostrar respuesta para tarjetas personalizadas
  const handleShowCustomAnswer = () => {
    stopSpeech();
    setIsChecked(true);
    Animated.timing(cardFlipAnim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  // 5. Procesar autoevaluación de tarjetas personalizadas (Pronto / Más tarde / Otro día / Nunca)
  const handleCustomCardAction = async (action: 'soon' | 'later' | 'next_day' | 'never') => {
    if (!currentCard || isProcessing) return;
    setIsProcessing(true);

    try {
      const cardId = currentCard.id;

      // Rotar la tarjeta suavemente de regreso al frente
      Animated.timing(cardFlipAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();

      setTimeout(async () => {
        try {
          if (action === 'soon') {
            // Reinsertar entre 5 y 10 tarjetas más adelante
            reinsertCurrentCardAhead(5, 10);
            advanceCard(false);
          } else if (action === 'later') {
            // Poner al final de la cola
            reinsertCurrentCardAtEnd();
            advanceCard(false);
          } else if (action === 'next_day') {
            // Aumenta 1 día en el SRS
            await rescheduleCardNextDay(cardId);
            advanceCard(true);
          } else if (action === 'never') {
            // Quita la tarjeta definitivamente del repaso
            await removeCardFromReview(cardId);
            advanceCard(true);
          }
          cardFlipAnim.setValue(0);
        } catch (err) {
          console.error('Error al procesar acción interna custom:', err);
          setIsProcessing(false);
        }
      }, 140);
    } catch (e) {
      console.error('Error al procesar acción de tarjeta custom:', e);
      setIsProcessing(false);
    }
  };

  const renderDeckGridItem = useCallback(({ item }: { item: DeckWithStats }) => {
    const isCustom = item.type === 'custom';
    const langMeta = ALL_LANGUAGES.find((l) => l.code === item.languageCode) || SUPPORTED_LANGUAGES[0];
    const dueCount = item.dueCount || 0;
    const cardsInReview = item.activeCardsCount !== undefined ? item.activeCardsCount : (item.wordCount || 0);
    const hasDue = dueCount > 0;

    return (
      <TouchableOpacity
        style={[
          styles.gridCard,
          {
            backgroundColor: colors.surface,
            borderColor: hasDue ? (isCustom ? '#10B981' : colors.primary) : colors.border,
          },
        ]}
        activeOpacity={0.75}
        onPress={() => promptStudyMethod(item.id, item.name, hasDue)}
      >
        <View style={styles.gridCardTopRow}>
          <View
            style={[
              styles.gridFlagCircle,
              {
                backgroundColor: isCustom
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(59, 130, 246, 0.15)',
              },
            ]}
          >
            {isCustom ? (
              <Ionicons
                name="layers"
                size={20}
                color="#10B981"
              />
            ) : (
              <Text style={styles.gridFlagEmoji}>{langMeta.flag}</Text>
            )}
          </View>

          {hasDue ? (
            <View
              style={[
                styles.gridDueBadge,
                {
                  backgroundColor: isCustom
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'rgba(59, 130, 246, 0.15)',
                  borderColor: isCustom
                    ? 'rgba(16, 185, 129, 0.35)'
                    : 'rgba(59, 130, 246, 0.35)',
                },
              ]}
            >
              <Text
                style={[
                  styles.gridDueBadgeText,
                  { color: isCustom ? '#10B981' : colors.primary },
                ]}
              >
                {dueCount} hoy
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.gridDueBadge,
                {
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  borderColor: 'rgba(16, 185, 129, 0.25)',
                },
              ]}
            >
              <Text style={[styles.gridDueBadgeText, { color: '#10B981' }]}>
                Al día
              </Text>
            </View>
          )}
        </View>

        <View style={styles.gridCardBody}>
          <Text style={[styles.gridCardTitle, { color: colors.text }]} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={[styles.gridCardSub, { color: colors.textMuted }]} numberOfLines={1}>
            {isCustom ? 'Personalizado' : (langMeta?.label || 'General')} • {cardsInReview}{' '}
            {cardsInReview === 1 ? (isCustom ? 'tarjeta' : 'palabra') : (isCustom ? 'tarjetas' : 'palabras')}
          </Text>
        </View>

        <View style={[styles.gridCardFooter, { borderTopColor: colors.border }]}>
          <Text
            style={[
              styles.gridCardActionText,
              { color: hasDue ? (isCustom ? '#10B981' : colors.primary) : colors.textMuted },
            ]}
          >
            {hasDue ? 'Repasar ahora' : 'Practicar'}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={14}
            color={hasDue ? (isCustom ? '#10B981' : colors.primary) : colors.textMuted}
          />
        </View>
      </TouchableOpacity>
    );
  }, [colors, promptStudyMethod]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Cargando repaso...</Text>
      </View>
    );
  }

  // VISTA 1: Selector visual de mazos en cuadrículas ("cuadraditos uno al lado del otro")
  if (!selectedDeckId) {
    const totalDue = decksList.reduce((acc, d) => acc + (d.dueCount || 0), 0);
    const hasMultipleDecksWithDue = decksList.length > 1 && totalDue > 0;

    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Spacing.sm }]}>
        <View style={styles.selectionHeader}>
          <View style={styles.selectionTitleRow}>
            <Text style={[styles.selectionTitle, { color: colors.text }]}>Repetición Espaciada</Text>
            {totalDue > 0 ? (
              <View style={[styles.totalDuePill, { backgroundColor: colors.primary }]}>
                <Text style={styles.totalDuePillText}>{totalDue} pendientes</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.selectionSub, { color: colors.textMuted }]}>
            Elige un mazo para enfocar tu estudio o repasa todos juntos
          </Text>
        </View>

        {hasMultipleDecksWithDue ? (
          <TouchableOpacity
            style={[styles.heroAllDecksCard, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
            onPress={() => promptStudyMethod('all', 'Todos los mazos', true)}
          >
            <View style={styles.heroLeft}>
              <View style={styles.heroIconBox}>
                <Ionicons name="flash" size={20} color={colors.primary} />
              </View>
              <View style={styles.heroTextCol}>
                <Text style={styles.heroTitle}>Repasar Todos los Mazos</Text>
                <Text style={styles.heroSub}>
                  {totalDue} {totalDue === 1 ? 'tarjeta pendiente' : 'tarjetas pendientes'} en total
                </Text>
              </View>
            </View>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        ) : null}

        {decksList.length === 0 ? (
          <View style={styles.emptyGridContainer}>
            <Ionicons name="albums-outline" size={54} color={colors.textMuted} />
            <Text style={[styles.emptyGridTitle, { color: colors.text }]}>No hay tarjetas en repaso</Text>
            <Text style={[styles.emptyGridSub, { color: colors.textMuted }]}>
              Agrega tarjetas al repaso (+ Agregar al repaso) desde tus mazos para comenzar a estudiar con el sistema SRS.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: Spacing.md }]}
              onPress={() => router.push('/')}
            >
              <Ionicons name="add" size={20} color="#FFF" style={{ marginRight: 6 }} />
              <Text style={styles.primaryBtnText}>Ir a Mis Mazos</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={decksList}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.gridColumnWrapper}
            contentContainerStyle={styles.gridContentContainer}
            showsVerticalScrollIndicator={false}
            renderItem={renderDeckGridItem}
            removeClippedSubviews={Platform.OS === 'android'}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            windowSize={3}
          />
        )}

        <ReviewMethodModal
          visible={showMethodModal}
          pendingSelection={pendingSelection}
          colors={colors}
          onClose={() => setShowMethodModal(false)}
          onSelectMethod={handleSelectMethod}
        />
      </View>
    );
  }

  // VISTA 2: Estado sin tarjetas pendientes en este mazo o sesión terminada
  if (dueCards.length === 0 || sessionCompleted) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Spacing.sm }]}>
        <SessionSummaryView
          sessionCompleted={sessionCompleted}
          sessionCount={sessionCount}
          selectedDeckName={selectedDeckName}
          colors={colors}
          onExitSession={handleExitSession}
          onPracticeAll={() => {
            if (selectedDeckId) {
              promptStudyMethod(selectedDeckId, selectedDeckName, false);
            } else {
              handleExitSession();
            }
          }}
        />

        <ReviewMethodModal
          visible={showMethodModal}
          pendingSelection={pendingSelection}
          colors={colors}
          onClose={() => setShowMethodModal(false)}
          onSelectMethod={handleSelectMethod}
        />
      </View>
    );
  }

  const isCustomCard =
    currentCard?.deckType === 'custom' ||
    currentCard?.languageCode === 'custom' ||
    (currentCard?.deckType !== 'language' && currentCard?.languageCode === 'es-ES');
  const lang = isCustomCard ? 'es-ES' : getEffectiveCardLanguage(currentCard);
  const isIdeographic = !isCustomCard && (lang.startsWith('zh') || lang.startsWith('ja'));
  const isJapanese = !isCustomCard && lang.startsWith('ja');

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Barra de progreso de la sesión */}
      <View style={[styles.progressHeader, { paddingTop: Spacing.sm }]}>
        <View style={styles.progressRow}>
          <Text style={[styles.progressText, { color: colors.textMuted }]}>
            Tarjeta {currentIndex + 1} de {dueCards.length}
          </Text>

          <View style={[styles.deckBadgeContainer, { backgroundColor: colors.surfaceHighlight }]}>
            <Text style={[styles.deckNameBadge, { color: isCustomCard ? '#10B981' : colors.primary }]} numberOfLines={1}>
              {selectedDeckName}
            </Text>
          </View>
        </View>
        <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceHighlight }]}>
          <View
            style={[
              styles.progressBarFill,
              {
                backgroundColor: isCustomCard ? '#10B981' : colors.primary,
                width: `${((currentIndex + 1) / dueCards.length) * 100}%`,
              },
            ]}
          />
        </View>
      </View>

      <View
        style={{ flex: 1 }}
        onTouchStart={() => {
          if (studyMethod === 'voice' && isChecked) {
            pauseCountdownTimer();
          }
        }}
        onTouchEnd={() => {
          if (studyMethod === 'voice' && isChecked) {
            resumeCountdownTimer();
          }
        }}
        onTouchCancel={() => {
          if (studyMethod === 'voice' && isChecked) {
            resumeCountdownTimer();
          }
        }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Lo que el usuario pronuncia con altura fija de 60px para que nunca salte */}
          {studyMethod === 'voice' && !isCustomCard && (
            <VoiceTranscriptArea
              card={currentCard}
              isChecked={isChecked}
              colors={colors}
            />
          )}

          {/* Contenedor Flip Card 3D */}
          <View style={styles.flipContainer}>
            {/* Texto sutil de guía sobre la tarjeta sin badge ni ícono, sin alterar la posición vertical de la tarjeta */}
            {studyMethod === 'text' && !isChecked && isIdeographic && (
              <Text style={[styles.optionsGuidanceText, { color: colors.textMuted }]}>
                {t('review.answerAnyOption')}
              </Text>
            )}
            {/* CARA FRONTAL: Pregunta */}
            <Animated.View
              style={[
                styles.quizCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
                frontAnimatedStyle,
              ]}
            >
              {isCustomCard ? (
                <View style={styles.customFrontBox}>
                  <View style={styles.customFrontHeaderRow}>
                    <TouchableOpacity
                      style={styles.customCleanSpeakerBtn}
                      activeOpacity={0.7}
                      onPress={() => speakText(currentCard.displayText, 'es-ES')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="volume-medium-outline" size={22} color={colors.primary} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.customQuestionScroll} contentContainerStyle={styles.customQuestionScrollContent}>
                    <Text style={[styles.customQuestionText, { color: colors.text }]}>
                      {currentCard.displayText}
                    </Text>
                  </ScrollView>
                </View>
              ) : (
                <>
                  <Text
                    style={[
                      isIdeographic ? styles.charIdeographic : styles.charAlphabetic,
                      {
                        color: colors.text,
                        fontSize: 38,
                      },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit={true}
                  >
                    {currentCard.displayText}
                  </Text>

                  {/* Formulario de Respuestas Modo Clásico (Teclado) aislado para latencia cero */}
                  {studyMethod === 'text' && !isChecked && (
                    <ReviewTextInputSection
                      isIdeographic={isIdeographic}
                      languageCode={lang}
                      onSubmit={handleCheck}
                      colors={colors}
                    />
                  )}
                </>
              )}
            </Animated.View>

            {/* CARA TRASERA (REVERSO 3D) */}
            <Animated.View
              style={[
                styles.quizCard,
                styles.quizCardBack,
                {
                  backgroundColor: colors.surface,
                  borderColor: isCustomCard ? '#10B981' : (evaluation?.isReadingCorrect ? colors.primary : colors.danger),
                },
                backAnimatedStyle,
              ]}
              pointerEvents={isChecked ? 'auto' : 'none'}
            >
              {isCustomCard ? (
                <View style={styles.customBackBox}>
                  <Text style={[styles.customBackQuestionPrompt, { color: colors.textMuted }]} numberOfLines={2}>
                    {currentCard.displayText}
                  </Text>

                  <View style={[styles.customAnswerBox, { backgroundColor: colors.surfaceHighlight }]}>
                    <TouchableOpacity
                      style={styles.customAnswerSpeakerBtn}
                      activeOpacity={0.7}
                      onPress={() => speakText(meaningsList[0] || currentCard.displayMeaning, 'es-ES')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="volume-medium-outline" size={22} color={colors.textMuted} />
                    </TouchableOpacity>

                    <ScrollView style={styles.customAnswerScroll} contentContainerStyle={styles.customAnswerScrollContent}>
                      <Text style={[styles.customAnswerText, { color: colors.text }]}>
                        {meaningsList.length > 0 ? meaningsList.join('\n') : currentCard.displayMeaning}
                      </Text>
                    </ScrollView>
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.flipTopStatusRow}>
                    <View
                      style={[
                        styles.flipBadgeRow,
                        {
                          backgroundColor: evaluation?.isReadingCorrect
                            ? 'rgba(16, 185, 129, 0.14)'
                            : 'rgba(239, 68, 68, 0.14)',
                        },
                      ]}
                    >
                      <Ionicons
                        name={evaluation?.isReadingCorrect ? 'checkmark-circle' : 'close-circle'}
                        size={18}
                        color={evaluation?.isReadingCorrect ? '#10B981' : colors.danger}
                      />
                      <Text
                        style={[
                          styles.flipBadgeText,
                          { color: evaluation?.isReadingCorrect ? '#10B981' : colors.danger },
                        ]}
                      >
                        {evaluation?.isReadingCorrect ? '¡Correcto!' : 'Respuesta Incorrecta'}
                      </Text>
                    </View>
                  </View>

                  {/* Si la palabra tiene Kanji: Kanji en el centro de la tarjeta */}
                  <View style={styles.flipReadingHeroBox}>
                    <Text
                      style={[
                        isIdeographic ? styles.charIdeographic : styles.charAlphabetic,
                        styles.flipHeroWordLarge,
                        { color: colors.text },
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit={true}
                    >
                      {currentCard.displayText}
                    </Text>
                  </View>

                  {/* Contenedor gris con Pronunciación (hiragana/pinyin) arriba y Significado abajo */}
                  <View style={[styles.flipBackSectionBox, { backgroundColor: colors.surfaceHighlight }]}>
                    {Boolean(currentCard.displayReading) && (
                      <>
                        <Text style={[styles.flipBackLabel, { color: colors.textMuted }]}>Pronunciación</Text>
                        <Text style={[styles.flipHeroReadingSmall, { color: colors.primary, marginBottom: 4 }]} numberOfLines={2}>
                          {isJapanese ? formatJapaneseReading(currentCard.displayReading) : currentCard.displayReading}
                        </Text>

                        {/* Desglose On/Kun adicional para tarjetas de Kanji */}
                        {(() => {
                          let kanjiReadings: string | undefined;
                          if (currentCard.auxiliaryInfo) {
                            try {
                              const aux = JSON.parse(currentCard.auxiliaryInfo);
                              kanjiReadings = aux.kanjiReadings;
                            } catch { }
                          }
                          return kanjiReadings && kanjiReadings !== currentCard.displayReading ? (
                            <Text style={[styles.flipKanjiReadingsSub, { color: colors.textMuted }]} numberOfLines={1}>
                              {kanjiReadings}
                            </Text>
                          ) : null;
                        })()}

                        {/* Desglose por sílaba Pinyin con círculos de porcentaje y barra de llenado (memoizado) */}
                        {evaluation?.voiceScore?.breakdown && evaluation.voiceScore.breakdown.length > 0 && (
                          <SyllableBreakdownView
                            breakdown={evaluation.voiceScore.breakdown}
                            colors={colors}
                          />
                        )}
                      </>
                    )}
                    <Text style={[styles.flipBackLabel, { color: colors.textMuted }]}>Significado</Text>
                    <Text style={[styles.flipBackMeaningText, { color: colors.text }]} numberOfLines={2}>
                      {meaningsList.join(', ')}
                    </Text>
                  </View>
                </>
              )}
            </Animated.View>
          </View>

          {/* Área Flotante Fuera de la Tarjeta: Micrófono (antes de responder) o Badge de Precisión (después de responder) */}
          {studyMethod === 'voice' && (
            <View style={styles.voiceFloatingContainer}>
              {!isChecked ? (
                <VoiceMicControl
                  isListening={isListening}
                  speechStatus={speechStatus}
                  voiceProgressAnim={voiceProgressAnim}
                  micPulseAnim={micPulseAnim}
                  colors={colors}
                  onPress={() => {
                    if (isListening) {
                      speechService.stop();
                      setIsListening(false);
                      setSpeechStatus('idle');
                      voiceProgressAnim.stopAnimation();
                    } else {
                      startVoiceListeningForCard(currentCard, lang);
                    }
                  }}
                />
              ) : (
                evaluation?.voiceScore && (
                  <View style={styles.outsideVoiceScoreWrapper}>
                    <View
                      style={[
                        styles.outsideVoiceScoreBadge,
                        {
                          backgroundColor:
                            evaluation.voiceScore.score >= 90
                              ? 'rgba(16, 185, 129, 0.12)'
                              : evaluation.voiceScore.score >= 70
                                ? 'rgba(245, 158, 11, 0.12)'
                                : 'rgba(239, 68, 68, 0.12)',
                          borderColor:
                            evaluation.voiceScore.score >= 90
                              ? '#10B981'
                              : evaluation.voiceScore.score >= 70
                                ? '#F59E0B'
                                : colors.danger,
                        },
                      ]}
                    >
                      <Ionicons
                        name="mic"
                        size={20}
                        color={
                          evaluation.voiceScore.score >= 90
                            ? '#10B981'
                            : evaluation.voiceScore.score >= 70
                              ? '#F59E0B'
                              : colors.danger
                        }
                        style={{ marginRight: 8 }}
                      />
                      <Text
                        style={[
                          styles.outsideVoiceScoreText,
                          {
                            color:
                              evaluation.voiceScore.score >= 90
                                ? '#10B981'
                                : evaluation.voiceScore.score >= 70
                                  ? '#F59E0B'
                                  : colors.danger,
                          },
                        ]}
                      >
                        {evaluation.voiceScore.label}
                      </Text>
                    </View>
                  </View>
                )
              )}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Barra de cuenta regresiva visible solo cuando la tarjeta está dada vuelta en modo voz (acelerada por GPU a 60 FPS) */}
      {studyMethod === 'voice' && isChecked && (
        <View style={styles.flipCountdownContainer}>
          <Animated.View
            style={[
              styles.flipCountdownBar,
              {
                backgroundColor: colors.primary,
                transform: [
                  {
                    scaleX: flipCountdownAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 1],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      )}

      {/* Barra de Acciones Inferior */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom + 8, Spacing.md),
          },
          isCustomCard && styles.customBottomBar,
        ]}
      >
        {isCustomCard ? (
          !isChecked ? (
            <View style={styles.customBottomBarContent}>
              <TouchableOpacity
                style={[styles.showAnswerBtn, { backgroundColor: '#10B981' }]}
                activeOpacity={0.8}
                onPress={handleShowCustomAnswer}
              >
                <Text style={styles.showAnswerBtnText}>Mostrar Respuesta</Text>
                <Ionicons name="eye-outline" size={20} color="#FFF" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.customBottomBarContent}>
              <Text style={[styles.customEvaluationPrompt, { color: colors.text }]}>
                ¿Cuándo querés volver a repasarla?
              </Text>
              <View style={styles.customButtonRow}>
                {/* 1. Pronto (Azul) */}
                <TouchableOpacity
                  style={[styles.customChoiceBtn, { backgroundColor: '#3B82F6' }, isProcessing && { opacity: 0.6 }]}
                  activeOpacity={0.8}
                  disabled={isProcessing}
                  onPress={() => handleCustomCardAction('soon')}
                >
                  <Text style={styles.customChoiceTitle}>Pronto</Text>
                  <Text style={styles.customChoiceSub}>En el medio</Text>
                </TouchableOpacity>

                {/* 2. Más tarde (Ámbar) */}
                <TouchableOpacity
                  style={[styles.customChoiceBtn, { backgroundColor: '#F59E0B' }, isProcessing && { opacity: 0.6 }]}
                  activeOpacity={0.8}
                  disabled={isProcessing}
                  onPress={() => handleCustomCardAction('later')}
                >
                  <Text style={styles.customChoiceTitle}>Más tarde</Text>
                  <Text style={styles.customChoiceSub}>Al final</Text>
                </TouchableOpacity>

                {/* 3. Otro día (Verde Esmeralda) */}
                <TouchableOpacity
                  style={[styles.customChoiceBtn, { backgroundColor: '#10B981' }, isProcessing && { opacity: 0.6 }]}
                  activeOpacity={0.8}
                  disabled={isProcessing}
                  onPress={() => handleCustomCardAction('next_day')}
                >
                  <Text style={styles.customChoiceTitle}>Otro día</Text>
                  <Text style={styles.customChoiceSub}>+1 día</Text>
                </TouchableOpacity>

                {/* 4. Nunca (Rojo) */}
                <TouchableOpacity
                  style={[styles.customChoiceBtn, { backgroundColor: '#EF4444' }, isProcessing && { opacity: 0.6 }]}
                  activeOpacity={0.8}
                  disabled={isProcessing}
                  onPress={() => handleCustomCardAction('never')}
                >
                  <Text style={styles.customChoiceTitle}>Nunca</Text>
                  <Text style={styles.customChoiceSub}>Quitar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        ) : studyMethod === 'voice' ? (
          <View style={styles.actionButtonsRow}>
            {isChecked ? (
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                onPress={advanceToNextVoiceCard}
              >
                <Text style={styles.nextBtnText}>{t('review.nextCardNow')}</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.giveUpBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border, flex: 1 }]}
                onPress={() => handleVoiceEvaluation(currentCard, false)}
              >
                <Text style={[styles.giveUpBtnText, { color: colors.textMuted }]}>{t('review.iDontKnow')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          !isChecked ? (
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity style={[styles.giveUpBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]} onPress={handleGiveUp}>
                <Text style={[styles.giveUpBtnText, { color: colors.textMuted }]}>{t('review.iDontKnow')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.checkBtn, { backgroundColor: colors.primary }]} onPress={handleCheck}>
                <Text style={styles.checkBtnText}>{t('review.check')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: colors.primary }, isProcessing && { opacity: 0.7 }]}
                disabled={isProcessing}
                onPress={handleNextCard}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Text style={styles.nextBtnText}>{t('review.nextCard')}</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={18}
                      color="#FFF"
                      style={{ marginLeft: 6 }}
                    />
                  </>
                )}
              </TouchableOpacity>
            </View>
          )
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
    paddingBottom: 70,
  },
  loadingText: {
    ...Typography.body,
    marginTop: Spacing.md,
  },
  progressHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  progressText: {
    ...Typography.bodySmall,
    fontWeight: '600',
  },
  deckNameBadge: {
    fontSize: 11,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.md,
  },
  flipContainer: {
    width: '100%',
    position: 'relative',
    minHeight: 330,
    justifyContent: 'center',
  },
  quizCard: {
    width: '100%',
    minHeight: 330,
    borderRadius: 24,
    padding: Spacing.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
  },
  quizCardBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 330,
    borderRadius: 24,
    padding: Spacing.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
  },
  charIdeographic: {
    ...Typography.chineseLarge,
    textAlign: 'center',
    paddingHorizontal: 8,
    width: '100%',
  },
  charAlphabetic: {
    fontWeight: 'bold',
    textAlign: 'center',
    paddingHorizontal: 8,
    width: '100%',
  },
  flipTopStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    width: '100%',
  },
  flipBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  flipBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  voiceScoreRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  voiceScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  voiceScoreText: {
    fontSize: 12,
    fontWeight: '700',
  },
  flipReadingHeroBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.xs,
    width: '100%',
  },
  flipHeroReadingSmall: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 2,
    textAlign: 'center',
  },
  flipKanjiReadingsSub: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
    textAlign: 'center',
    opacity: 0.85,
  },
  flipHeroWordLarge: {
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 1,
    textAlign: 'center',
  },
  breakdownContainer: {
    width: '100%',
    marginVertical: 4,
    alignItems: 'center',
  },
  breakdownSectionTitle: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  syllablesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
  },
  syllableCard: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 64,
  },
  syllableHeader: {
    alignItems: 'center',
    marginBottom: 2,
  },
  syllableChar: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  syllableText: {
    fontSize: 12,
    fontWeight: '700',
  },
  circleBox: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  circleScoreTextContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleScoreNumber: {
    fontSize: 10,
    fontWeight: '800',
  },
  flipBackSectionBox: {
    width: '100%',
    padding: Spacing.sm,
    borderRadius: 12,
    marginVertical: 4,
    alignItems: 'center',
  },
  flipBackLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  flipBackMeaningText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  flipAudioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: Spacing.sm,
  },
  flipAudioBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  audioBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  inputsSection: {
    width: '100%',
    marginTop: Spacing.sm,
  },
  inputGroup: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    ...Typography.bodySmall,
    marginBottom: 6,
    fontWeight: '600',
  },
  textInput: {
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
  },
  feedbackSection: {
    width: '100%',
    marginTop: Spacing.sm,
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  badgeSuccess: {
    backgroundColor: '#10B981',
  },
  badgeWarning: {
    backgroundColor: '#F59E0B',
  },
  badgeError: {
    backgroundColor: '#EF4444',
  },
  resultBadgeText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  answerBox: {
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.sm,
    borderWidth: 1,
  },
  answerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  answerLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  correctTag: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: 'bold',
  },
  incorrectTag: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: 'bold',
  },
  answerValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  userAnswerText: {
    fontSize: 13,
    marginTop: 4,
    fontStyle: 'italic',
  },
  compoundsBox: {
    padding: Spacing.sm,
    borderRadius: 12,
    marginTop: Spacing.xs,
  },
  compoundsTitle: {
    fontSize: 11,
    marginBottom: 4,
  },
  compoundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  compChar: {
    fontWeight: 'bold',
    fontSize: 14,
    marginRight: 4,
  },
  compPinyin: {
    fontSize: 12,
    marginRight: 4,
  },
  compMeaning: {
    fontSize: 12,
    flex: 1,
  },
  flipCountdownContainer: {
    width: '100%',
    height: 4,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  flipCountdownBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    transformOrigin: 'left',
  },
  bottomBar: {
    padding: Spacing.md,
    paddingBottom: 78,
    borderTopWidth: 1,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  giveUpBtn: {
    flex: 1,
    marginRight: Spacing.sm,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  giveUpBtnText: {
    fontWeight: '600',
    fontSize: 15,
  },
  checkBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  checkBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  nextBtn: {
    flex: 1,
    width: '100%',
    minHeight: 50,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: 14,
  },
  nextBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  optionsGuidanceText: {
    position: 'absolute',
    top: -26,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
  },
  completedBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    paddingBottom: 70,
  },
  completedIconBox: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
  },
  completedTitle: {
    ...Typography.h1,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  completedSub: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 14,
    marginBottom: Spacing.md,
    width: '100%',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    width: '100%',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontWeight: '600',
    fontSize: 16,
  },
  // Estilos del Selector Visual de Mazos en Cuadrícula ("cuadraditos")
  selectionHeader: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  selectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  selectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  totalDuePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  totalDuePillText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  selectionSub: {
    ...Typography.bodySmall,
    fontSize: 13,
  },
  heroAllDecksCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: 18,
    ...Shadows.card,
  },
  heroLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  heroIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  heroTextCol: {
    flex: 1,
  },
  heroTitle: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  heroSub: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 12,
  },
  gridColumnWrapper: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  gridContentContainer: {
    paddingBottom: 100,
  },
  gridCard: {
    flex: 1,
    height: 156,
    borderRadius: 18,
    borderWidth: 1,
    padding: Spacing.md,
    justifyContent: 'space-between',
    ...Shadows.card,
  },
  gridCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridFlagCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridFlagEmoji: {
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  gridDueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  gridDueBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  gridCardBody: {
    marginVertical: Spacing.xs,
  },
  gridCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    lineHeight: 20,
    marginBottom: 2,
  },
  gridCardSub: {
    fontSize: 12,
  },
  gridCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  gridCardActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerBackBtn: {
    paddingRight: Spacing.xs,
    paddingVertical: 2,
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBrandText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  headerBrandSep: {
    fontSize: 18,
    fontWeight: '600',
    flexShrink: 0,
  },
  headerSubtitleText: {
    fontSize: 17,
    fontWeight: '600',
    flexShrink: 1,
  },
  deckBadgeContainer: {
    maxWidth: 140,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  emptyGridContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    paddingBottom: 80,
  },
  emptyGridTitle: {
    ...Typography.h2,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  emptyGridSub: {
    ...Typography.bodySmall,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Estilos del Modo Voz Manos Libres Flotante
  voiceFloatingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    width: '100%',
    height: 155,
  },
  outsideVoiceScoreWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  outsideVoiceScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.5,
  },
  outsideVoiceScoreText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // Estilos de tarjetas y flujo de Mazos Personalizados (Custom)
  customFrontBox: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
  },
  customBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    width: '100%',
  },
  customDeckTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  customDeckTypeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  customCardSpeakerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customFrontHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
    marginBottom: 4,
  },
  customCleanSpeakerBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customQuestionScroll: {
    flex: 1,
    width: '100%',
  },
  customQuestionScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  customQuestionText: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 32,
  },
  customBackBox: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
  },
  customBackQuestionPrompt: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 10,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  customAnswerBox: {
    flex: 1,
    borderRadius: 16,
    padding: Spacing.sm,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  customAnswerSpeakerBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
  },
  customAnswerScroll: {
    flex: 1,
    width: '100%',
  },
  customAnswerScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 36,
    paddingBottom: 16,
  },
  customAnswerText: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
  },
  customBottomBar: {
    paddingTop: 6,
    paddingHorizontal: Spacing.md,
  },
  customBottomBarContent: {
    height: 82,
    justifyContent: 'center',
    width: '100%',
  },
  showAnswerBtn: {
    width: '100%',
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    ...Shadows.card,
  },
  showAnswerBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  customEvaluationPrompt: {
    fontSize: 13.5,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  customButtonRow: {
    flexDirection: 'row',
    gap: 6,
    width: '100%',
  },
  customChoiceBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 3,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  customChoiceTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  customChoiceSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
});
