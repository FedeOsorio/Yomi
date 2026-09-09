import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
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
import { speechService } from '../../lib/speech-recognition-service';
import { saveCustomCard, updateCustomCard } from '../../lib/word-service';
import { useTheme } from '../../providers/ThemeProvider';
import { Colors, Shadows, Spacing, Typography } from '../constants/theme';

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
  const animProgress = useRef(new Animated.Value(0)).current;
  const questionInputRef = useRef<TextInput>(null);
  const answerInputRef = useRef<TextInput>(null);

  const { height: SCREEN_HEIGHT } = Dimensions.get('window');

  const backdropOpacity = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const sheetTranslateY = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_HEIGHT, 0],
  });

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
      animProgress.setValue(0);
      Animated.spring(animProgress, {
        toValue: 1,
        damping: 26,
        mass: 0.7,
        stiffness: 260,
        overshootClamping: true,
        useNativeDriver: true,
      }).start();
    } else {
      stopVoiceListening();
      setQuestion('');
      setAnswer('');
    }
  }, [visible, initialCard]);

  const isClosingRef = useRef(false);

  const handleClose = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    questionInputRef.current?.blur();
    answerInputRef.current?.blur();
    Keyboard.dismiss();

    Animated.spring(animProgress, {
      toValue: 0,
      damping: 26,
      mass: 0.7,
      stiffness: 260,
      overshootClamping: true,
      useNativeDriver: true,
    }).start(() => {
      isClosingRef.current = false;
      onClose();
    });
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
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(0,0,0,0.65)', opacity: backdropOpacity },
          ]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <Animated.View
          style={[
            styles.modalContent,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              transform: [{ translateY: sheetTranslateY }],
            },
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

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Campo Pregunta */}
            <View style={styles.fieldContainer}>
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
                onChangeText={(t) => {
                  setQuestion(t);
                  if (listeningTarget === 'question') {
                    accumulatedTextRef.current = t;
                  }
                }}
              />
            </View>

            {/* Campo Respuesta */}
            <View style={styles.fieldContainer}>
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
                onChangeText={(t) => {
                  setAnswer(t);
                  if (listeningTarget === 'answer') {
                    accumulatedTextRef.current = t;
                  }
                }}
              />
            </View>

            {/* Botones de Acción */}
            <View style={styles.actionRow}>
              {!isEditMode && (
                <TouchableOpacity
                  style={[styles.saveAndAddBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
                  onPress={() => handleSave(true)}
                  disabled={isSaving}
                >
                  <Text style={[styles.saveAndAddText, { color: colors.text }]}>
                    Guardar y otra
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: isEditMode ? '#10B981' : colors.primary }, isEditMode && { flex: 1 }]}
                onPress={() => handleSave(false)}
                disabled={isSaving}
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
    maxHeight: '85%',
    overflow: 'hidden',
    ...Shadows.card,
    elevation: 0,
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
    minHeight: 90,
    textAlignVertical: 'top',
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
