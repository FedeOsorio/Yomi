import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
  Extrapolation,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { speechService } from '../../lib/speech-recognition-service';
import { saveCustomCard, updateCustomCard } from '../../lib/word-service';
import { useTheme } from '../../providers/ThemeProvider';
import { Shadows, Spacing, Typography } from '../constants/theme';

const TEXT_AREA_HEIGHT = 132;
const SWAP_DURATION = 700;

export interface CustomCardData {
  id: string;
  question: string;
  answer: string;
}

interface CustomCardModalProps {
  visible: boolean;
  deckId: string;
  initialCard?: CustomCardData | null;
  onClose: () => void;
  onCardAdded?: () => void;
}

export function CustomCardModal({
  visible,
  deckId,
  initialCard,
  onClose,
  onCardAdded,
}: CustomCardModalProps) {
  const { colors } = useTheme();
  const isEditMode = Boolean(initialCard);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [listeningTarget, setListeningTarget] = useState<'question' | 'answer' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const accumulatedTextRef = useRef('');
  const animProgress = useSharedValue(0);
  const swapAnim = useSharedValue(0);
  const swapIconRotate = useSharedValue(0);
  const isSwappingShared = useSharedValue(false);
  const travelDistanceShared = useSharedValue(117); // 212 * 0.55 aprox
  const swapInFlightRef = useRef(false);
  const midSwapTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const slotMetricsRef = useRef({
    question: { containerY: 0 },
    answer: { containerY: 0 },
  });

  const syncSwapDistance = () => {
    if (swapInFlightRef.current) return;
    const metrics = slotMetricsRef.current;
    if (metrics.question.containerY >= 0 && metrics.answer.containerY > metrics.question.containerY) {
      const next = metrics.answer.containerY - metrics.question.containerY;
      travelDistanceShared.value = Math.round(next * 0.55);
    }
  };
  const questionInputRef = useRef<TextInput>(null);
  const answerInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const { height: SCREEN_HEIGHT } = Dimensions.get('window');

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: animProgress.value,
  }));

  const sheetAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      animProgress.value,
      [0, 1],
      [SCREEN_HEIGHT, 0],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ translateY }],
    };
  });

  // Animación física de cartas idéntica:
  // Fase 1 (0.0 -> 0.20): Salto y encogimiento ("saltaran y se achicaran como tarjetas").
  // Fase 2 (0.20 -> 0.65): Se desplazan hacia el centro, cruzan e intercambian textos en 0.40.
  //                       La tarjeta frontal (pregunta) vuela por encima hacia el frente.
  // Fase 3 (0.65 -> 1.0): Asentadas en sus ranuras con los nuevos textos, vuelven a crecer.
  const questionAnimatedStyle = useAnimatedStyle(() => {
    if (!isSwappingShared.value) {
      return {
        transform: [{ translateY: 0 }, { scale: 1 }],
        opacity: 1,
      };
    }
    const D = travelDistanceShared.value;
    const scale = interpolate(
      swapAnim.value,
      [0, 0.08, 0.2, 0.65, 1],
      [1, 1.03, 0.9, 0.9, 1],
      Extrapolation.CLAMP
    );
    const translateY = interpolate(
      swapAnim.value,
      [0, 0.2, 0.32, 0.42, 0.54, 0.65, 1],
      [0, 0, Math.round(D * 0.45), D, Math.round(D * 0.45), 0, 0],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      swapAnim.value,
      [0, 0.34, 0.4, 0.46, 1],
      [1, 1, 0, 1, 1],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ translateY }, { scale }],
      opacity,
    };
  });

  const answerAnimatedStyle = useAnimatedStyle(() => {
    if (!isSwappingShared.value) {
      return {
        transform: [{ translateY: 0 }, { scale: 1 }],
        opacity: 1,
      };
    }
    const D = travelDistanceShared.value;
    const scale = interpolate(
      swapAnim.value,
      [0, 0.08, 0.2, 0.65, 1],
      [1, 1.03, 0.9, 0.9, 1],
      Extrapolation.CLAMP
    );
    const translateY = interpolate(
      swapAnim.value,
      [0, 0.2, 0.32, 0.42, 0.54, 0.65, 1],
      [0, 0, -Math.round(D * 0.45), -D, -Math.round(D * 0.45), 0, 0],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      swapAnim.value,
      [0, 0.34, 0.4, 0.46, 1],
      [1, 1, 0, 1, 1],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ translateY }, { scale }],
      opacity,
    };
  });

  const swapIconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${swapIconRotate.value}deg` }],
  }));

  const stopVoiceListening = async () => {
    await speechService.stop();
    setListeningTarget(null);
  };

  useEffect(() => {
    if (visible) {
      if (initialCard) {
        setQuestion(initialCard.question);
        setAnswer(initialCard.answer);
      } else {
        setQuestion('');
        setAnswer('');
      }
      isClosingRef.current = false;
      swapAnim.value = 0;
      isSwappingShared.value = false;
      setIsSwapping(false);
      swapInFlightRef.current = false;
      animProgress.value = 0;
      animProgress.value = withSpring(1, {
        damping: 26,
        mass: 0.7,
        stiffness: 260,
        overshootClamping: true,
      });
    } else {
      stopVoiceListening();
      setQuestion('');
      setAnswer('');
      swapAnim.value = 0;
      isSwappingShared.value = false;
      setIsSwapping(false);
      swapInFlightRef.current = false;
    }
  }, [visible, initialCard]);

  const isClosingRef = useRef(false);

  const notifyClose = () => {
    isClosingRef.current = false;
    onClose();
  };

  const handleClose = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    questionInputRef.current?.blur();
    answerInputRef.current?.blur();
    Keyboard.dismiss();

    animProgress.value = withSpring(
      0,
      {
        damping: 26,
        mass: 0.7,
        stiffness: 260,
        overshootClamping: true,
      },
      (finished) => {
        'worklet';
        if (finished) {
          runOnJS(notifyClose)();
        }
      }
    );
  };

  const toggleVoice = async (target: 'question' | 'answer') => {
    if (listeningTarget === target) {
      await stopVoiceListening();
      return;
    }

    if (listeningTarget) {
      await stopVoiceListening();
    }

    const currentFieldValue = target === 'question' ? question : answer;
    accumulatedTextRef.current = currentFieldValue;

    setListeningTarget(target);

    await speechService.start('es-ES', {
      onResult: (transcript, isFinal) => {
        const trimmed = transcript.trim();
        if (!trimmed) return;

        const base = accumulatedTextRef.current.trim();
        const fullText = base ? `${base} ${trimmed}` : trimmed;

        if (target === 'question') {
          setQuestion(fullText);
        } else {
          setAnswer(fullText);
        }

        if (isFinal) {
          accumulatedTextRef.current = fullText;
        }
      },
      onError: (err) => {
        setListeningTarget(null);
      },
      onEnd: () => {
        setListeningTarget(null);
      },
    });
  };

  const finishSwap = (newQuestion: string, newAnswer: string) => {
    if (midSwapTimerRef.current) clearTimeout(midSwapTimerRef.current);
    setQuestion(newQuestion);
    setAnswer(newAnswer);
    setIsSwapping(false);
    isSwappingShared.value = false;
    swapAnim.value = 0;
    swapInFlightRef.current = false;
  };

  const handleSwap = () => {
    if (swapInFlightRef.current || isSaving) return;
    if (!question.trim() && !answer.trim()) return;
    swapInFlightRef.current = true;

    questionInputRef.current?.blur();
    answerInputRef.current?.blur();
    Keyboard.dismiss();

    if (listeningTarget) {
      stopVoiceListening();
    }

    const previousQuestion = question;
    const previousAnswer = answer;

    setIsSwapping(true);
    isSwappingShared.value = true;
    swapAnim.value = 0;

    swapIconRotate.value = withTiming(swapIconRotate.value + 180, {
      duration: SWAP_DURATION * 0.6,
      easing: Easing.inOut(Easing.quad),
    });

    if (midSwapTimerRef.current) clearTimeout(midSwapTimerRef.current);
    midSwapTimerRef.current = setTimeout(() => {
      setQuestion(previousAnswer);
      setAnswer(previousQuestion);
    }, Math.round(SWAP_DURATION * 0.4));

    swapAnim.value = withTiming(
      1,
      {
        duration: SWAP_DURATION,
        easing: Easing.inOut(Easing.quad),
      },
      (finished) => {
        'worklet';
        if (finished) {
          runOnJS(finishSwap)(previousAnswer, previousQuestion);
        }
      }
    );
  };

  const handleSave = async (addAnother: boolean = false) => {
    if (!question.trim()) {
      Alert.alert('Falta la pregunta', 'Por favor ingresa la pregunta de la tarjeta.');
      return;
    }
    if (!answer.trim()) {
      Alert.alert('Falta la respuesta', 'Por favor ingresa la respuesta de la tarjeta.');
      return;
    }

    if (listeningTarget) {
      await stopVoiceListening();
    }

    setIsSaving(true);
    try {
      if (isEditMode && initialCard) {
        await updateCustomCard(initialCard.id, question, answer);
      } else {
        await saveCustomCard(deckId, question, answer);
      }
      onCardAdded?.();

      if (addAnother && !isEditMode) {
        setQuestion('');
        setAnswer('');
      } else {
        handleClose();
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la tarjeta. Intenta de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.65)' },
              backdropAnimatedStyle,
            ]}
          />
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
          <Animated.View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
              sheetAnimatedStyle,
              isSwapping && { overflow: 'visible' },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerTitleBox}>
                <View style={[styles.badgeIndicator, { backgroundColor: isEditMode ? '#10B981' : colors.primary }]} />
                <Text style={[styles.title, { color: colors.text }]}>
                  {isEditMode ? 'Editar Tarjeta' : 'Nueva Tarjeta'}
                </Text>
              </View>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollViewRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
              <View
                style={styles.swapStage}
                pointerEvents={isSwapping ? 'none' : 'auto'}
              >
                {/* Campo Pregunta */}
                <View
                  style={[
                    styles.fieldContainer,
                    styles.fieldContainerTop,
                    isSwapping && { zIndex: 30 },
                  ]}
                  onLayout={(event) => {
                    slotMetricsRef.current.question.containerY =
                      event.nativeEvent.layout.y;
                    syncSwapDistance();
                  }}
                >
                  <View style={styles.labelRow}>
                    <Text style={[styles.label, { color: colors.text }]}>Pregunta (Frente)</Text>
                    <TouchableOpacity
                      style={[
                        styles.micBtn,
                        listeningTarget === 'question' && styles.micBtnActive,
                        { backgroundColor: listeningTarget === 'question' ? colors.danger : colors.surfaceHighlight },
                      ]}
                      onPress={() => toggleVoice('question')}
                    >
                      <Ionicons
                        name={listeningTarget === 'question' ? 'stop' : 'mic-outline'}
                        size={16}
                        color={listeningTarget === 'question' ? '#FFF' : colors.primary}
                      />
                      <Text
                        style={[
                          styles.micBtnText,
                          { color: listeningTarget === 'question' ? '#FFF' : colors.primary },
                        ]}
                      >
                        {listeningTarget === 'question' ? 'Escuchando...' : 'Dictar'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Animated.View
                    renderToHardwareTextureAndroid={isSwapping}
                    shouldRasterizeIOS={isSwapping}
                    style={[
                      styles.swapBox,
                      isSwapping && { zIndex: 30 },
                      questionAnimatedStyle,
                    ]}
                  >
                    <TextInput
                      ref={questionInputRef}
                      style={[
                        styles.textArea,
                        {
                          backgroundColor: colors.surfaceHighlight,
                          borderColor: listeningTarget === 'question' ? colors.primary : colors.border,
                          color: colors.text,
                        },
                      ]}
                      placeholder="Ej. ¿Cuáles son los pares craneales sensitivos?"
                      placeholderTextColor={colors.textMuted}
                      multiline={true}
                      value={question}
                      editable={!isSwapping}
                      onFocus={() => {
                        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                      }}
                      onChangeText={(t) => {
                        setQuestion(t);
                        if (listeningTarget === 'question') {
                          accumulatedTextRef.current = t;
                        }
                      }}
                    />
                  </Animated.View>
                </View>

                <View style={styles.swapDivider}>
                  <View style={[styles.swapLine, { backgroundColor: colors.border }]} />
                  <TouchableOpacity
                    style={[
                      styles.swapToggle,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                      isSwapping && { borderColor: colors.primary },
                    ]}
                    onPress={handleSwap}
                    disabled={isSwapping || isSaving}
                    activeOpacity={0.75}
                    accessibilityLabel="Intercambiar"
                  >
                    <Animated.View style={swapIconAnimatedStyle}>
                      <Ionicons
                        name="swap-vertical"
                        size={15}
                        color={isSwapping ? colors.primary : colors.textMuted}
                      />
                    </Animated.View>
                    <Text
                      style={[
                        styles.swapToggleText,
                        { color: isSwapping ? colors.primary : colors.textMuted },
                      ]}
                    >
                      Intercambiar
                    </Text>
                  </TouchableOpacity>
                  <View style={[styles.swapLine, { backgroundColor: colors.border }]} />
                </View>

                {/* Campo Respuesta */}
                <View
                  style={[
                    styles.fieldContainer,
                    isSwapping && { zIndex: 20 },
                  ]}
                  onLayout={(event) => {
                    slotMetricsRef.current.answer.containerY =
                      event.nativeEvent.layout.y;
                    syncSwapDistance();
                  }}
                >
                  <View style={styles.labelRow}>
                    <Text style={[styles.label, { color: colors.text }]}>Respuesta (Reverso)</Text>
                    <TouchableOpacity
                      style={[
                        styles.micBtn,
                        listeningTarget === 'answer' && styles.micBtnActive,
                        { backgroundColor: listeningTarget === 'answer' ? colors.danger : colors.surfaceHighlight },
                      ]}
                      onPress={() => toggleVoice('answer')}
                    >
                      <Ionicons
                        name={listeningTarget === 'answer' ? 'stop' : 'mic-outline'}
                        size={16}
                        color={listeningTarget === 'answer' ? '#FFF' : colors.primary}
                      />
                      <Text
                        style={[
                          styles.micBtnText,
                          { color: listeningTarget === 'answer' ? '#FFF' : colors.primary },
                        ]}
                      >
                        {listeningTarget === 'answer' ? 'Escuchando...' : 'Dictar'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Animated.View
                    renderToHardwareTextureAndroid={isSwapping}
                    shouldRasterizeIOS={isSwapping}
                    style={[
                      styles.swapBox,
                      isSwapping && { zIndex: 20 },
                      answerAnimatedStyle,
                    ]}
                  >
                    <TextInput
                      ref={answerInputRef}
                      style={[
                        styles.textArea,
                        {
                          backgroundColor: colors.surfaceHighlight,
                          borderColor: listeningTarget === 'answer' ? colors.primary : colors.border,
                          color: colors.text,
                        },
                      ]}
                      placeholder="Ej. I (Olfatorio), II (Óptico) y VIII (Vestibulococlear)"
                      placeholderTextColor={colors.textMuted}
                      multiline={true}
                      value={answer}
                      editable={!isSwapping}
                      onFocus={() => {
                        setTimeout(() => {
                          scrollViewRef.current?.scrollToEnd({ animated: true });
                        }, 120);
                      }}
                      onChangeText={(t) => {
                        setAnswer(t);
                        if (listeningTarget === 'answer') {
                          accumulatedTextRef.current = t;
                        }
                      }}
                    />
                  </Animated.View>
                </View>
              </View>

              {/* Botones de Acción */}
              <View style={styles.actionRow}>
                {!isEditMode && (
                  <TouchableOpacity
                    style={[styles.saveAndAddBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
                    onPress={() => handleSave(true)}
                    disabled={isSaving || isSwapping}
                  >
                    <Text style={[styles.saveAndAddText, { color: colors.text }]}>
                      Guardar y otra
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: isEditMode ? '#10B981' : colors.primary }, isEditMode && { flex: 1 }]}
                  onPress={() => handleSave(false)}
                  disabled={isSaving || isSwapping}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>{isEditMode ? 'Guardar Cambios' : 'Guardar'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    borderWidth: 1,
    maxHeight: '90%',
    overflow: 'hidden',
    ...Shadows.card,
    elevation: 0,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  headerTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeIndicator: {
    width: 8,
    height: 18,
    borderRadius: 4,
    marginRight: 10,
  },
  title: {
    ...Typography.h2,
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  fieldContainer: {
    marginBottom: Spacing.lg,
    zIndex: 1,
  },
  fieldContainerTop: {
    marginBottom: 0,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  micBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  micBtnActive: {
    backgroundColor: '#EF4444',
  },
  micBtnText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  textArea: {
    borderRadius: 14,
    padding: Spacing.md,
    fontSize: 15,
    borderWidth: 1.5,
    height: TEXT_AREA_HEIGHT,
    textAlignVertical: 'top',
  },
  swapDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.sm,
    zIndex: 5,
  },
  swapLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  swapToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  swapToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  swapStage: {
    position: 'relative',
    overflow: 'visible',
  },
  swapBox: {
    width: '100%',
    borderRadius: 14,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  saveAndAddBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  saveAndAddText: {
    fontSize: 15,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});