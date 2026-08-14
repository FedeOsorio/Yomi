import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getDueCards,
  processCardReview,
  checkReadingMatch,
  checkMeaningMatch,
  calculateReviewRating,
  DueCardWithContext,
} from '../../../lib/srs-engine';
import { getCompoundWordsForChar, CompoundWord } from '../../../lib/word-service';
import { speakText } from '../../../lib/audio-service';
import { Colors, Spacing, Typography, Shadows } from '../../constants/theme';
import { Rating } from 'ts-fsrs';

export default function ReviewScreen() {
  const [dueCards, setDueCards] = useState<DueCardWithContext[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  // Estados del cuestionario interactivo
  const [inputReading, setInputReading] = useState('');
  const [inputMeaning, setInputMeaning] = useState('');
  const [isChecked, setIsChecked] = useState(false);
  const [evaluation, setEvaluation] = useState<{
    isReadingCorrect: boolean;
    isMeaningCorrect: boolean;
    computedRating: Rating;
  } | null>(null);

  const [currentCompoundWords, setCurrentCompoundWords] = useState<CompoundWord[]>([]);
  const router = useRouter();

  const loadCards = async () => {
    setLoading(true);
    setSessionCompleted(false);
    setCurrentIndex(0);
    resetForm();
    const cards = await getDueCards();
    setDueCards(cards);
    setLoading(false);
  };

  const resetForm = () => {
    setInputReading('');
    setInputMeaning('');
    setIsChecked(false);
    setEvaluation(null);
  };

  useFocusEffect(
    useCallback(() => {
      loadCards();
    }, [])
  );

  const currentCard = dueCards[currentIndex] || null;

  // Cargar palabras compuestas de ejemplo para la tarjeta actual
  useEffect(() => {
    let isMounted = true;
    if (currentCard) {
      const lang = currentCard.languageCode || 'zh-CN';
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
  }, [currentCard?.id]);

  const handleSpeak = () => {
    if (!currentCard) return;
    const lang = currentCard.languageCode || 'zh-CN';
    speakText(currentCard.displayText, lang);
  };

  // 1. Comprobar respuestas objetivamente
  const handleCheckAnswer = async () => {
    if (!currentCard || isChecked) return;

    const lang = currentCard.languageCode || 'zh-CN';
    const isIdeographic = lang.startsWith('zh') || lang.startsWith('ja');

    const readingCorrect = isIdeographic
      ? checkReadingMatch(currentCard.displayReading, inputReading)
      : true;

    const meaningCorrect = checkMeaningMatch(currentCard.displayMeaning, inputMeaning);

    const computedRating = calculateReviewRating(readingCorrect, meaningCorrect, isIdeographic);

    setEvaluation({
      isReadingCorrect: readingCorrect,
      isMeaningCorrect: meaningCorrect,
      computedRating,
    });
    setIsChecked(true);

    // Reproducir pronunciación automática para fijar el audio
    handleSpeak();
  };

  // 2. Opción "No me acuerdo" -> Falla automáticamente y muestra solución
  const handleGiveUp = () => {
    if (!currentCard || isChecked) return;

    setEvaluation({
      isReadingCorrect: false,
      isMeaningCorrect: false,
      computedRating: Rating.Again,
    });
    setIsChecked(true);
    handleSpeak();
  };

  // 3. Avanzar a la siguiente tarjeta y guardar resultado FSRS
  const handleNextCard = async () => {
    if (!currentCard || !evaluation || isProcessing) return;
    setIsProcessing(true);

    try {
      await processCardReview(currentCard.id, evaluation.computedRating);
      setSessionCount((prev) => prev + 1);

      if (currentIndex + 1 < dueCards.length) {
        setCurrentIndex((prev) => prev + 1);
        resetForm();
      } else {
        setSessionCompleted(true);
      }
    } catch (e) {
      console.error('Error al guardar repaso FSRS:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Cargando repaso diario...</Text>
      </View>
    );
  }

  // Estado: Sin tarjetas pendientes o sesión terminada
  if (dueCards.length === 0 || sessionCompleted) {
    return (
      <View style={styles.container}>
        <View style={styles.completedBox}>
          <View style={styles.completedIconBox}>
            <Ionicons name="trophy" size={54} color={Colors.primary} />
          </View>
          <Text style={styles.completedTitle}>
            {sessionCompleted ? '¡Sesión completada!' : '¡Todo al día!'}
          </Text>
          <Text style={styles.completedSub}>
            {sessionCompleted
              ? `Completaste la verificación de ${sessionCount} tarjeta(s).`
              : 'No tienes tarjetas pendientes de repaso por ahora.'}
          </Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={loadCards}>
            <Ionicons name="refresh" size={20} color={Colors.background} style={{ marginRight: 6 }} />
            <Text style={styles.primaryBtnText}>Volver a comprobar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/search')}>
            <Ionicons name="add" size={20} color={Colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.secondaryBtnText}>Agregar más palabras</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const lang = currentCard?.languageCode || 'zh-CN';
  const isIdeographic = lang.startsWith('zh') || lang.startsWith('ja');

  let meaningsList: string[] = [];
  try {
    meaningsList = JSON.parse(currentCard.displayMeaning);
  } catch {
    meaningsList = [currentCard.displayMeaning];
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Barra de progreso */}
      <View style={styles.progressHeader}>
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>
            Tarjeta {currentIndex + 1} de {dueCards.length}
          </Text>
          <Text style={styles.deckNameBadge}>{lang}</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${((currentIndex + 1) / dueCards.length) * 100}%` },
            ]}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Tarjeta de Pregunta */}
        <View style={styles.quizCard}>
          <Text style={isIdeographic ? styles.charIdeographic : styles.charAlphabetic}>
            {currentCard.displayText}
          </Text>

          <TouchableOpacity style={styles.audioBtn} onPress={handleSpeak}>
            <Ionicons name="volume-high" size={22} color={Colors.primary} />
          </TouchableOpacity>

          {/* Formulario de Respuestas (Antes de comprobar) */}
          {!isChecked && (
            <View style={styles.inputsSection}>
              {isIdeographic && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>1. ¿Cómo se pronuncia? (Pinyin / Lectura):</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Ej. xue, ni3 hao3"
                    placeholderTextColor={Colors.textMuted}
                    value={inputReading}
                    onChangeText={setInputReading}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  {isIdeographic ? '2. ¿Qué significa?' : '¿Qué significa esta palabra?'}
                </Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Ej. aprender, estudiar"
                  placeholderTextColor={Colors.textMuted}
                  value={inputMeaning}
                  onChangeText={setInputMeaning}
                  autoCapitalize="none"
                />
              </View>
            </View>
          )}

          {/* Sección de Retroalimentación (Después de comprobar) */}
          {isChecked && evaluation && (
            <View style={styles.feedbackSection}>
              {/* Badge de resultado general */}
              <View
                style={[
                  styles.resultBadge,
                  evaluation.computedRating === Rating.Good
                    ? styles.badgeSuccess
                    : evaluation.computedRating === Rating.Hard
                    ? styles.badgeWarning
                    : styles.badgeError,
                ]}
              >
                <Ionicons
                  name={
                    evaluation.computedRating === Rating.Good
                      ? 'checkmark-circle'
                      : evaluation.computedRating === Rating.Hard
                      ? 'alert-circle'
                      : 'close-circle'
                  }
                  size={20}
                  color="#FFF"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.resultBadgeText}>
                  {evaluation.computedRating === Rating.Good
                    ? '¡Excelente! Respuesta correcta'
                    : evaluation.computedRating === Rating.Hard
                    ? 'Parcial: acertaste una parte'
                    : 'Para repasar pronto'}
                </Text>
              </View>

              {/* Detalle de Lectura */}
              {isIdeographic && (
                <View style={styles.answerBox}>
                  <View style={styles.answerHeaderRow}>
                    <Text style={styles.answerLabel}>Lectura / Fonética:</Text>
                    {evaluation.isReadingCorrect ? (
                      <Text style={styles.correctTag}>✅ Correcto</Text>
                    ) : (
                      <Text style={styles.incorrectTag}>❌ Incorrecto</Text>
                    )}
                  </View>
                  <Text style={styles.answerValue}>{currentCard.displayReading}</Text>
                  {inputReading ? (
                    <Text style={styles.userAnswerText}>Tu respuesta: {inputReading}</Text>
                  ) : null}
                </View>
              )}

              {/* Detalle de Significado */}
              <View style={styles.answerBox}>
                <View style={styles.answerHeaderRow}>
                  <Text style={styles.answerLabel}>Significado:</Text>
                  {evaluation.isMeaningCorrect ? (
                    <Text style={styles.correctTag}>✅ Correcto</Text>
                  ) : (
                    <Text style={styles.incorrectTag}>❌ Incorrecto</Text>
                  )}
                </View>
                <Text style={styles.answerValue}>{meaningsList.join(', ')}</Text>
                {inputMeaning ? (
                  <Text style={styles.userAnswerText}>Tu respuesta: {inputMeaning}</Text>
                ) : null}
              </View>

              {/* 2-3 Ejemplos / Compuestas para reforzar */}
              {isIdeographic && currentCompoundWords.length > 0 && (
                <View style={styles.compoundsBox}>
                  <Text style={styles.compoundsTitle}>Palabras compuestas comunes:</Text>
                  {currentCompoundWords.map((comp) => (
                    <View key={comp.id} style={styles.compoundRow}>
                      <Text style={styles.compChar}>{comp.simplified}</Text>
                      <Text style={styles.compPinyin}>({comp.pinyinDisplay})</Text>
                      <Text style={styles.compMeaning} numberOfLines={1}>
                        : {comp.meanings.slice(0, 1).join(', ')}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Barra de Acciones Inferior */}
      <View style={styles.bottomBar}>
        {!isChecked ? (
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity style={styles.giveUpBtn} onPress={handleGiveUp}>
              <Text style={styles.giveUpBtnText}>No me acuerdo</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.checkBtn} onPress={handleCheckAnswer}>
              <Text style={styles.checkBtnText}>Comprobar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, isProcessing && { opacity: 0.7 }]}
            disabled={isProcessing}
            onPress={handleNextCard}
          >
            {isProcessing ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <>
                <Text style={styles.nextBtnText}>Siguiente tarjeta</Text>
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color={Colors.background}
                  style={{ marginLeft: 6 }}
                />
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: Spacing.xl,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.lg,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textMuted,
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
    color: Colors.textMuted,
    fontWeight: '600',
  },
  deckNameBadge: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: 'bold',
    backgroundColor: Colors.surfaceHighlight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  scrollContainer: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
  quizCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    ...Shadows.card,
  },
  charIdeographic: {
    ...Typography.chineseLarge,
    fontSize: 56,
    color: Colors.text,
    textAlign: 'center',
  },
  charAlphabetic: {
    fontSize: 34,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
  },
  audioBtn: {
    backgroundColor: Colors.surfaceHighlight,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
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
    color: Colors.textMuted,
    marginBottom: 6,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
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
    backgroundColor: Colors.surfaceHighlight,
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  answerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  answerLabel: {
    fontSize: 12,
    color: Colors.textMuted,
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
    color: Colors.text,
  },
  userAnswerText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  compoundsBox: {
    backgroundColor: Colors.surfaceHighlight,
    padding: Spacing.sm,
    borderRadius: 12,
    marginTop: Spacing.xs,
  },
  compoundsTitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  compoundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
  },
  compChar: {
    fontWeight: 'bold',
    color: Colors.primary,
    fontSize: 14,
    marginRight: 4,
  },
  compPinyin: {
    color: Colors.primaryHover,
    fontSize: 12,
    marginRight: 4,
  },
  compMeaning: {
    color: Colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  bottomBar: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  giveUpBtn: {
    flex: 1,
    marginRight: Spacing.sm,
    backgroundColor: Colors.surfaceHighlight,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  giveUpBtnText: {
    color: Colors.textMuted,
    fontWeight: '600',
    fontSize: 15,
  },
  checkBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    ...Shadows.card,
  },
  checkBtnText: {
    color: Colors.background,
    fontWeight: 'bold',
    fontSize: 16,
  },
  nextBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    ...Shadows.card,
  },
  nextBtnText: {
    color: Colors.background,
    fontWeight: 'bold',
    fontSize: 16,
  },
  completedBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  completedIconBox: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  completedTitle: {
    ...Typography.h1,
    color: Colors.text,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  completedSub: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
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
    color: Colors.background,
    fontWeight: 'bold',
    fontSize: 16,
  },
  secondaryBtn: {
    backgroundColor: Colors.surfaceHighlight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    width: '100%',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 16,
  },
});
