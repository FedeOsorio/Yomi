import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Rating } from 'ts-fsrs';
import { speakText, stopSpeech } from '../../../lib/audio-service';
import { detectTextLanguage, getEffectiveCardLanguage } from '../../../lib/japanese-utils';
import { calculateChineseAccuracyScore } from '../../../lib/pinyin-utils';
import { JLPT_KANJI_READINGS } from '../../../lib/jlpt-data';
import { singleKanjiReadings } from '../../../lib/voice-match';
import { parseAux } from '../../../lib/word-aux';
import {
  calculateReviewRating,
  checkMeaningMatch,
  checkReadingMatch,
  removeCardFromReview,
  rescheduleCardNextDay,
} from '../../../lib/srs-engine';
import { useTheme } from '../../../providers/ThemeProvider';
import { ConjugationPracticeModal } from '../../components/ConjugationPracticeModal';
import { DeckPicker } from '../../components/review/DeckPicker';
import { CustomCardAction, ReviewBottomBar } from '../../components/review/ReviewBottomBar';
import { ReviewCard } from '../../components/review/ReviewCard';
import { ReviewMethodModal } from '../../components/review/ReviewMethodModal';
import { SessionSummaryView } from '../../components/review/SessionSummaryView';
import { VoiceMicControl } from '../../components/review/VoiceMicControl';
import { VoiceModelRequiredModal } from '../../components/review/VoiceModelRequiredModal';
import { VoiceScoreBadge } from '../../components/review/VoiceScoreBadge';
import { VoiceTranscriptArea } from '../../components/review/VoiceTranscriptArea';
import { Spacing, Typography } from '../../constants/theme';
import { useTranslation } from '../../i18n';
import { useAutoAdvance } from '../../hooks/review/useAutoAdvance';
import { useCardFlip } from '../../hooks/review/useCardFlip';
import { useCardMeanings } from '../../hooks/review/useCardMeanings';
import { useSessionLifecycle } from '../../hooks/review/useSessionLifecycle';
import { useVoiceReview } from '../../hooks/review/useVoiceReview';
import { CardEvaluation, StudyMethod, useReviewStore } from '../../stores/reviewStore';

/**
 * Pestaña Repaso. Muestra el selector de mazos, el resumen al terminar o la sesión activa.
 * La lógica pesada vive en hooks: voz (useVoiceReview), giro de la tarjeta (useCardFlip),
 * cuenta regresiva (useAutoAdvance) y ciclo de vida de la pantalla (useSessionLifecycle).
 */
export default function ReviewScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { deckId: paramDeckId } = useLocalSearchParams<{ deckId?: string }>();

  const decksList = useReviewStore((s) => s.decksList);
  const selectedDeckId = useReviewStore((s) => s.selectedDeckId);
  const selectedDeckName = useReviewStore((s) => s.selectedDeckName);
  const studyMethod = useReviewStore((s) => s.studyMethod);
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
  const isListening = useReviewStore((s) => s.isListening);
  const speechStatus = useReviewStore((s) => s.speechStatus);
  const {
    fetchDecksData,
    promptStudyMethod,
    setShowMethodModal,
    startSession,
    exitSession,
    setIsChecked,
    setEvaluation,
    setIsProcessing,
    resetCurrentCardForm,
    advanceCard,
    answerCurrentCard,
    saveCardReview,
    reinsertCurrentCardAhead,
    reinsertCurrentCardAtEnd,
  } = useReviewStore.getState();

  const flip = useCardFlip();
  const autoAdvance = useAutoAdvance();
  const voice = useVoiceReview(flip, autoAdvance);

  const currentCard = dueCards[currentIndex] || null;
  const meaningsList = useCardMeanings(currentCard);

  // Práctica de conjugaciones (se abre desde el modal de opciones)
  const [conjugationDeck, setConjugationDeck] = useState<{ id: string; name: string } | null>(null);

  // ───────────── Sesión ─────────────

  const handleStartSession = async (deckId: string, deckName: string, method: StudyMethod = 'text', practiceMode = false) => {
    resetCurrentCardForm();
    flip.reset();
    autoAdvance.cancel();
    await startSession(deckId, deckName, method, practiceMode);
    // En voz el micrófono NO se abre solo: queda en "Presiona para comenzar"
    if (method === 'voice') voice.resetForSession();
  };

  const handleSelectMethod = async (method: StudyMethod) => {
    if (!pendingSelection) return;
    const { deckId, deckName, hasDue, languageCode } = pendingSelection;
    const voiceLang = languageCode || 'ja-JP';
    if (method === 'voice' && !(await voice.ensureReady(voiceLang, () => setShowMethodModal(false)))) return;

    setShowMethodModal(false);
    await handleStartSession(deckId, deckName, method, !hasDue);
    // Carga del modelo en segundo plano: el micrófono muestra "Cargando motor de voz…"
    if (method === 'voice') voice.prepareModel(voiceLang);
  };

  const handleOpenConjugation = (deckId: string, deckName: string) => {
    setShowMethodModal(false);
    setTimeout(() => setConjugationDeck({ id: deckId, name: deckName }), 150);
  };

  const handleExitSession = () => {
    voice.endSession();
    exitSession();
    fetchDecksData();
  };

  useSessionLifecycle({
    selectedDeckId,
    selectedDeckName,
    isVoiceSessionActive: Boolean(selectedDeckId && studyMethod === 'voice' && !sessionCompleted),
    onExitSession: handleExitSession,
    onAppBackground: voice.pauseOnBackground,
    onScreenBlur: voice.pauseOnBlur,
  });

  // Al entrar a la pestaña: cargar mazos, o abrir directamente un mazo si vino por parámetro
  useFocusEffect(
    useCallback(() => {
      if (!paramDeckId) {
        fetchDecksData();
        return;
      }
      (async () => {
        try {
          await fetchDecksData();
          const deck = useReviewStore.getState().decksList.find((item) => item.id === paramDeckId);
          handleStartSession(paramDeckId, deck ? deck.name : 'Mazo', 'text', !((deck?.dueCount || 0) > 0));
        } catch (e) {
          console.warn('Error al iniciar sesión con paramDeckId:', e);
          fetchDecksData();
        }
      })();
    }, [paramDeckId])
  );

  // Tarjetas personalizadas: leer la pregunta en voz alta al mostrarla
  useEffect(() => {
    if (!currentCard || isChecked || sessionCompleted) return;
    const isCustom = currentCard.deckType === 'custom' || currentCard.languageCode === 'custom' || currentCard.languageCode === 'es-ES';
    if (!isCustom) return;
    const timer = setTimeout(() => speakText(currentCard.displayText, detectTextLanguage(currentCard.displayText)), 300);
    return () => clearTimeout(timer);
  }, [currentCard?.id, isChecked, sessionCompleted]);

  // ───────────── Modo escritura ─────────────

  const speakCurrentCard = () => {
    if (!currentCard) return;
    speakText(currentCard.displayText, getEffectiveCardLanguage(currentCard), currentCard.displayReading);
  };

  /** Muestra el dorso con la evaluación y lee la palabra al terminar el giro. */
  const revealAnswer = (result: CardEvaluation) => {
    setEvaluation(result);
    setIsChecked(true);
    flip.showBack(320, speakCurrentCard);
  };

  const handleCheck = () => {
    if (!currentCard) return;
    const lang = getEffectiveCardLanguage(currentCard);
    const isIdeographic = lang.startsWith('zh') || lang.startsWith('ja');

    let targetMeanings = currentCard.displayMeaning;
    let altKanjiReadings: string | undefined;
    const aux = parseAux(currentCard.auxiliaryInfo);
    if (Array.isArray(aux.selectedMeanings) && aux.selectedMeanings.length > 0) {
      targetMeanings = JSON.stringify(aux.selectedMeanings);
    }
    if (aux.kanjiReadings) altKanjiReadings = aux.kanjiReadings;
    // Tarjeta de un solo kanji: vale cualquiera de sus lecturas on/kun (las mismas que acepta la voz)
    if (lang.startsWith('ja')) {
      const jlpt = JLPT_KANJI_READINGS[(currentCard.displayText || '').trim()];
      const all = [...singleKanjiReadings(currentCard.displayText), jlpt?.essential, jlpt?.on, jlpt?.kun]
        .filter(Boolean)
        .join(' • ');
      if (all) altKanjiReadings = altKanjiReadings ? `${altKanjiReadings} • ${all}` : all;
    }

    const { inputReading, inputMeaning } = useReviewStore.getState();
    const isReadingCorrect = isIdeographic
      ? checkReadingMatch(currentCard.displayReading, inputReading) ||
      (altKanjiReadings ? checkReadingMatch(altKanjiReadings, inputReading) : false)
      : true;
    const isMeaningCorrect = checkMeaningMatch(targetMeanings, inputMeaning);

    let voiceScore: CardEvaluation['voiceScore'];
    if (lang.startsWith('zh') && inputReading) {
      const res = calculateChineseAccuracyScore(inputReading, currentCard.displayText, currentCard.displayReading);
      voiceScore = { score: res.score, label: res.label, breakdown: res.breakdown };
    }

    revealAnswer({
      isReadingCorrect,
      isMeaningCorrect,
      computedRating: calculateReviewRating(isReadingCorrect, isMeaningCorrect, isIdeographic),
      voiceScore,
    });
  };

  const handleGiveUp = () => {
    if (!currentCard) return;
    revealAnswer({ isReadingCorrect: false, isMeaningCorrect: false, computedRating: Rating.Again });
  };

  const handleNextCard = async () => {
    if (!currentCard || isProcessing) return;
    setIsProcessing(true);
    stopSpeech();
    try {
      if (evaluation) {
        const { wasFailedInSession } = answerCurrentCard(evaluation.computedRating);
        await saveCardReview(currentCard.id, evaluation.computedRating, wasFailedInSession);
      }
    } catch (e) {
      console.error('Error al guardar repaso FSRS:', e);
    }
    // El contenido cambia a mitad del giro (130 ms), cuando la tarjeta está de perfil
    flip.showFront(260, () => setIsProcessing(false));
    setTimeout(() => advanceCard(), 130);
  };

  // ───────────── Tarjetas personalizadas ─────────────

  const handleShowCustomAnswer = () => {
    stopSpeech();
    setIsChecked(true);
    flip.showBack(280);
  };

  const handleCustomCardAction = (action: CustomCardAction) => {
    if (!currentCard || isProcessing) return;
    setIsProcessing(true);
    const cardId = currentCard.id;
    flip.showFront(250);
    setTimeout(async () => {
      try {
        if (action === 'soon') {
          reinsertCurrentCardAhead(5, 10); // entre 5 y 10 tarjetas más adelante
          advanceCard(false);
        } else if (action === 'later') {
          reinsertCurrentCardAtEnd();
          advanceCard(false);
        } else if (action === 'next_day') {
          await rescheduleCardNextDay(cardId);
          advanceCard(true);
        } else {
          await removeCardFromReview(cardId);
          advanceCard(true);
        }
        flip.reset();
      } catch (err) {
        console.error('Error al procesar acción de tarjeta personalizada:', err);
        setIsProcessing(false);
      }
    }, 140);
  };

  // ───────────── Vistas ─────────────

  const voiceModelModal = (
    <VoiceModelRequiredModal
      visible={voice.showModelRequired}
      colors={colors}
      onClose={voice.closeModelRequired}
      onGoToDownload={voice.goToModelDownload}
    />
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>{t('review.loadingReview')}</Text>
      </View>
    );
  }

  // Selector de mazos
  if (!selectedDeckId) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Spacing.sm }]}>
        <DeckPicker decks={decksList} colors={colors} onSelectDeck={promptStudyMethod} onGoToDecks={() => router.push('/')} />
        <ReviewMethodModal
          visible={showMethodModal}
          pendingSelection={pendingSelection}
          colors={colors}
          onClose={() => setShowMethodModal(false)}
          onSelectMethod={handleSelectMethod}
          onSelectConjugation={() => {
            if (pendingSelection) handleOpenConjugation(pendingSelection.deckId, pendingSelection.deckName);
          }}
        />
        {voiceModelModal}
        {conjugationDeck && (
          <ConjugationPracticeModal
            visible
            onClose={() => {
              setConjugationDeck(null);
              fetchDecksData();
            }}
            deckId={conjugationDeck.id}
            deckName={conjugationDeck.name}
          />
        )}
      </View>
    );
  }

  // Mazo sin tarjetas pendientes o sesión terminada
  if (dueCards.length === 0 || sessionCompleted || !currentCard) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Spacing.sm }]}>
        <SessionSummaryView
          sessionCompleted={sessionCompleted}
          sessionCount={sessionCount}
          selectedDeckName={selectedDeckName}
          colors={colors}
          onExitSession={handleExitSession}
          onPracticeAll={() => promptStudyMethod(selectedDeckId, selectedDeckName, false)}
        />
        <ReviewMethodModal
          visible={showMethodModal}
          pendingSelection={pendingSelection}
          colors={colors}
          onClose={() => setShowMethodModal(false)}
          onSelectMethod={handleSelectMethod}
        />
        {voiceModelModal}
      </View>
    );
  }

  // Sesión activa
  const isCustomCard =
    currentCard.deckType === 'custom' ||
    currentCard.languageCode === 'custom' ||
    (currentCard.deckType !== 'language' && currentCard.languageCode === 'es-ES');
  const lang = getEffectiveCardLanguage(currentCard);
  const accent = isCustomCard ? '#10B981' : colors.primary;
  const isVoice = studyMethod === 'voice';

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Progreso de la sesión */}
      <View style={[styles.progressHeader, { paddingTop: Spacing.sm }]}>
        <View style={styles.progressRow}>
          <Text style={[styles.progressText, { color: colors.textMuted }]}>
            {t('review.cardProgress', { current: currentIndex + 1, total: dueCards.length })}
          </Text>
          <View style={[styles.deckBadgeContainer, { backgroundColor: colors.surfaceHighlight }]}>
            <Text style={[styles.deckNameBadge, { color: accent }]} numberOfLines={1}>
              {selectedDeckName}
            </Text>
          </View>
        </View>
        <View style={[styles.progressBarBg, { backgroundColor: colors.surfaceHighlight }]}>
          <View
            style={[styles.progressBarFill, { backgroundColor: accent, width: `${((currentIndex + 1) / dueCards.length) * 100}%` }]}
          />
        </View>
      </View>

      {/* Tocar la pantalla pausa la cuenta regresiva del modo voz */}
      <View
        style={{ flex: 1 }}
        onTouchStart={() => isVoice && isChecked && autoAdvance.pause()}
        onTouchEnd={() => isVoice && isChecked && autoAdvance.resume()}
        onTouchCancel={() => isVoice && isChecked && autoAdvance.resume()}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {isVoice && <VoiceTranscriptArea card={currentCard} isChecked={isChecked} feedback={voice.feedback} colors={colors} />}

          <ReviewCard
            card={currentCard}
            lang={lang}
            studyMethod={studyMethod}
            isChecked={isChecked}
            isCustomCard={isCustomCard}
            evaluation={evaluation}
            meaningsList={meaningsList}
            colors={colors}
            frontStyle={flip.frontStyle}
            backStyle={flip.backStyle}
            onSubmitText={handleCheck}
          />

          {/* Debajo de la tarjeta: micrófono antes de responder; precisión (chino) después */}
          {isVoice && (
            <View style={styles.voiceFloatingContainer}>
              {!isChecked ? (
                <VoiceMicControl
                  isListening={isListening}
                  speechStatus={speechStatus}
                  busyLabel={voice.setupLabel}
                  voiceProgressAnim={voice.progressAnim}
                  micPulseAnim={voice.pulseAnim}
                  colors={colors}
                  onPress={() => voice.toggleMic(currentCard, lang)}
                />
              ) : (
                evaluation?.voiceScore && (
                  <VoiceScoreBadge score={evaluation.voiceScore.score} label={evaluation.voiceScore.label} danger={colors.danger} />
                )
              )}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Cuenta regresiva hasta la siguiente tarjeta (modo voz, con la respuesta a la vista) */}
      {isVoice && isChecked && (
        <View style={styles.flipCountdownContainer}>
          <Animated.View
            style={[styles.flipCountdownBar, { backgroundColor: colors.primary, transform: [{ scaleX: autoAdvance.progress }] }]}
          />
        </View>
      )}

      <ReviewBottomBar
        studyMethod={studyMethod}
        isCustomCard={isCustomCard}
        isChecked={isChecked}
        isProcessing={isProcessing}
        evaluation={evaluation}
        bottomInset={insets.bottom}
        colors={colors}
        onShowCustomAnswer={handleShowCustomAnswer}
        onCustomAction={handleCustomCardAction}
        onVoiceGiveUp={() => voice.evaluate(currentCard, false)}
        onMarkIncorrect={voice.markIncorrect}
        onVoiceNext={voice.advance}
        onGiveUp={handleGiveUp}
        onCheck={handleCheck}
        onNext={handleNextCard}
      />
      {voiceModelModal}
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
  deckBadgeContainer: {
    maxWidth: 140,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  voiceFloatingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    width: '100%',
    height: 155,
  },
});
