import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { Spacing } from '../constants/theme';
import { getConjugableWordsForDeck, ConjugableWord } from '../../lib/word-service';
import {
  conjugateJapanese,
  JapaneseConjugationForm,
  romajiToHiragana,
  toNormalizedHiragana,
} from '../../lib/japanese-utils';
import { parseFurigana } from '../../lib/japanese-search';
import { speakText } from '../../lib/audio-service';
import { speechService } from '../../lib/speech-recognition-service';

interface ConjugationPracticeModalProps {
  visible: boolean;
  onClose: () => void;
  deckId: string;
  deckName: string;
}

const FORM_OPTIONS: Array<{ key: JapaneseConjugationForm; label: string; suffix: string }> = [
  { key: 'te', label: 'Forma -TE', suffix: '-て / -で' },
  { key: 'ta', label: 'Pasado -TA', suffix: '-た / -だ' },
  { key: 'nai', label: 'Negativo -NAI', suffix: '-ない' },
  { key: 'masu', label: 'Cortés -MASU', suffix: '-ます' },
];

export function ConjugationPracticeModal({
  visible,
  onClose,
  deckId,
  deckName,
}: ConjugationPracticeModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [wordsList, setWordsList] = useState<ConjugableWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedForm, setSelectedForm] = useState<JapaneseConjugationForm>('te');

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
      // Mezclar aleatoriamente las palabras para la práctica
      const shuffled = [...items].sort(() => Math.random() - 0.5);
      setWordsList(shuffled);
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

  const resetCardState = () => {
    setTextInput('');
    setSpokenTranscript('');
    setHasEvaluated(false);
    setIsCorrect(null);
    if (isListening) {
      speechService.stop();
      setIsListening(false);
    }
  };

  const resetSession = () => {
    resetCardState();
    setWordsList([]);
    setCurrentIndex(0);
    setCorrectCount(0);
    setTotalAttempted(0);
    setIsFinished(false);
  };

  const currentWord = wordsList[currentIndex];

  // Cálculo de la forma esperada
  const expectedConjugation = currentWord
    ? conjugateJapanese(currentWord.kanji, currentWord.reading, currentWord.category, selectedForm)
    : { kanji: '', reading: '' };

  // Evaluación de la respuesta
  const evaluateAnswer = (answer: string) => {
    if (!answer || !answer.trim() || !currentWord) return;
    const cleanAnswer = answer.trim();
    const normalizedAnswer = toNormalizedHiragana(cleanAnswer);
    const normalizedExpected = toNormalizedHiragana(expectedConjugation.reading);

    const match =
      cleanAnswer === expectedConjugation.kanji ||
      normalizedAnswer === normalizedExpected ||
      cleanAnswer === expectedConjugation.reading;

    setIsCorrect(match);
    setHasEvaluated(true);
    setTotalAttempted((prev) => prev + 1);
    if (match) {
      setCorrectCount((prev) => prev + 1);
      speakText(expectedConjugation.kanji, 'ja-JP');
    }
  };

  // Manejador del Input de texto con conversión automática Romaji -> Hiragana
  const handleTextChange = (text: string) => {
    // Si escribe en romaji, convertir automáticamente a hiragana en vivo
    const converted = romajiToHiragana(text);
    setTextInput(converted);
  };

  const handleSubmitText = () => {
    if (!textInput.trim() || hasEvaluated) return;
    evaluateAnswer(textInput);
  };

  // Control de reconocimiento por voz
  const toggleVoiceListening = async () => {
    if (isListening) {
      await speechService.stop();
      setIsListening(false);
      return;
    }

    if (hasEvaluated) return;

    setSpokenTranscript('');
    const started = await speechService.start('ja-JP', {
      onStart: () => setIsListening(true),
      onResult: (transcript, isFinal) => {
        setSpokenTranscript(transcript);
        if (isFinal && transcript.trim()) {
          setIsListening(false);
          evaluateAnswer(transcript);
        }
      },
      onError: () => setIsListening(false),
      onEnd: () => setIsListening(false),
    });

    if (!started) {
      setIsListening(false);
    }
  };

  const handleNextWord = () => {
    if (currentIndex + 1 < wordsList.length) {
      setCurrentIndex((prev) => prev + 1);
      resetCardState();
    } else {
      setIsFinished(true);
    }
  };

  const currentFormLabel = FORM_OPTIONS.find((f) => f.key === selectedForm)?.label || 'Forma -TE';
  const furiganaPairs = currentWord ? parseFurigana(currentWord.kanji, currentWord.reading) : [];

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {/* Cabecera */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleCenter}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Práctica de Conjugaciones</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>{deckName}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Selector de Forma Gramatical */}
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
                  onPress={() => {
                    setSelectedForm(opt.key);
                    resetCardState();
                  }}
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
        ) : wordsList.length === 0 ? (
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
            <Text style={[styles.finishedTitle, { color: colors.text }]}>¡Sesión Completada!</Text>
            <Text style={[styles.finishedScore, { color: colors.primary }]}>
              {correctCount} de {totalAttempted} correctas
            </Text>
            <View style={styles.finishedButtonsRow}>
              <TouchableOpacity style={[styles.secondaryActionBtn, { borderColor: colors.border }]} onPress={loadWords}>
                <Ionicons name="refresh" size={18} color={colors.text} style={{ marginRight: 6 }} />
                <Text style={[styles.secondaryActionBtnText, { color: colors.text }]}>Practicar de nuevo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]} onPress={onClose}>
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
                Palabra {currentIndex + 1} de {wordsList.length}
              </Text>
              <View style={styles.scoreRow}>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={[styles.scoreText, { color: '#10B981', marginRight: 10 }]}>{correctCount}</Text>
                <Ionicons name="close-circle" size={16} color="#EF4444" />
                <Text style={[styles.scoreText, { color: '#EF4444' }]}>{totalAttempted - correctCount}</Text>
              </View>
            </View>

            {/* Tarjeta Principal */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/* Badges de Categoría y Nivel */}
              <View style={styles.badgesRow}>
                <View style={[styles.categoryBadge, { backgroundColor: colors.surfaceHighlight }]}>
                  <Text style={[styles.categoryBadgeText, { color: colors.primary }]}>{currentWord.category}</Text>
                </View>
                {currentWord.level && (
                  <View style={[styles.levelBadge, { backgroundColor: colors.primary + '18' }]}>
                    <Text style={[styles.levelBadgeText, { color: colors.primary }]}>JLPT {currentWord.level}</Text>
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

              {/* Significados */}
              <Text style={[styles.meaningText, { color: colors.textMuted }]}>
                "{currentWord.meanings[0] || 'Significado'}"
              </Text>

              {/* Pregunta Objetivo */}
              <View style={[styles.targetPromptBox, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
                <Text style={[styles.targetPromptText, { color: colors.text }]}>
                  Pasar a <Text style={{ fontWeight: '800', color: colors.primary }}>{currentFormLabel}</Text>
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

                {/* Botón de Voz */}
                <TouchableOpacity
                  style={[
                    styles.micBtn,
                    { backgroundColor: isListening ? '#EF4444' : colors.surfaceHighlight, borderColor: colors.border },
                  ]}
                  onPress={toggleVoiceListening}
                  disabled={hasEvaluated}
                >
                  <Ionicons name={isListening ? 'mic' : 'mic-outline'} size={24} color={isListening ? '#FFF' : colors.primary} />
                  <Text style={[styles.micBtnText, { color: isListening ? '#FFF' : colors.text }]}>
                    {isListening ? 'Escuchando tu pronunciación...' : 'Responder por voz'}
                  </Text>
                </TouchableOpacity>

                {spokenTranscript ? (
                  <Text style={[styles.spokenText, { color: colors.textMuted }]}>
                    Voz detectada: <Text style={{ fontWeight: '700', color: colors.text }}>{spokenTranscript}</Text>
                  </Text>
                ) : null}
              </View>

              {/* Retroalimentación inmediata */}
              {hasEvaluated && (
                <View
                  style={[
                    styles.feedbackBox,
                    {
                      backgroundColor: isCorrect ? '#10B98115' : '#EF444415',
                      borderColor: isCorrect ? '#10B981' : '#EF4444',
                    },
                  ]}
                >
                  <View style={styles.feedbackHeader}>
                    <Ionicons
                      name={isCorrect ? 'checkmark-circle' : 'close-circle'}
                      size={24}
                      color={isCorrect ? '#10B981' : '#EF4444'}
                    />
                    <Text
                      style={[
                        styles.feedbackTitle,
                        { color: isCorrect ? '#10B981' : '#EF4444' },
                      ]}
                    >
                      {isCorrect ? '¡Excelente!' : 'Forma correcta:'}
                    </Text>
                  </View>
                  <Text style={[styles.correctAnswerText, { color: colors.text }]}>
                    {expectedConjugation.kanji} ({expectedConjugation.reading})
                  </Text>
                  <TouchableOpacity
                    style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                    onPress={handleNextWord}
                  >
                    <Text style={styles.nextBtnText}>Siguiente palabra</Text>
                    <Ionicons name="chevron-forward" size={18} color="#FFF" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  closeBtn: {
    padding: 6,
  },
  headerTitleCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
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
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 14,
  },
  noWordsTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: Spacing.md,
  },
  noWordsDesc: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 20,
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
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  levelBadgeText: {
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
    marginVertical: Spacing.md,
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
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  targetPromptText: {
    fontSize: 15,
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
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  micBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  spokenText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  feedbackBox: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedbackTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  correctAnswerText: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginVertical: 4,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    marginTop: 6,
    gap: 6,
  },
  nextBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
