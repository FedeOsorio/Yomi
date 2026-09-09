import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { saveCustomCard } from '../../lib/word-service';
import { useTheme } from '../../providers/ThemeProvider';
import { Colors, Shadows, Spacing, Typography } from '../constants/theme';

interface CustomCardModalProps {
  visible: boolean;
  deckId: string;
  onClose: () => void;
  onCardAdded?: () => void;
}

export function CustomCardModal({
  visible,
  deckId,
  onClose,
  onCardAdded,
}: CustomCardModalProps) {
  const { colors } = useTheme();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [listeningTarget, setListeningTarget] = useState<'question' | 'answer' | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const accumulatedTextRef = useRef('');
  const modalTranslateY = useRef(new Animated.Value(400)).current;

  const stopVoiceListening = async () => {
    await speechService.stop();
    setListeningTarget(null);
  };

  useEffect(() => {
    if (visible) {
      modalTranslateY.setValue(400);
      Animated.spring(modalTranslateY, {
        toValue: 0,
        damping: 24,
        stiffness: 240,
        useNativeDriver: true,
      }).start();
    } else {
      stopVoiceListening();
      setQuestion('');
      setAnswer('');
    }
  }, [visible]);

  const handleClose = () => {
    Animated.timing(modalTranslateY, {
      toValue: 400,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
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
      await saveCustomCard(deckId, question, answer);
      onCardAdded?.();

      if (addAnother) {
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
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <Animated.View
          style={[
            styles.modalContent,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              transform: [{ translateY: modalTranslateY }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleBox}>
              <View style={[styles.badgeIndicator, { backgroundColor: colors.primary }]} />
              <Text style={[styles.title, { color: colors.text }]}>Nueva Tarjeta</Text>
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
                    name={listeningTarget === 'question' ? 'mic' : 'mic-outline'}
                    size={18}
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
                    name={listeningTarget === 'answer' ? 'mic' : 'mic-outline'}
                    size={18}
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
              <TouchableOpacity
                style={[styles.saveAndAddBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
                onPress={() => handleSave(true)}
                disabled={isSaving}
              >
                <Text style={[styles.saveAndAddText, { color: colors.text }]}>
                  Guardar y otra
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleSave(false)}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Guardar</Text>
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
    backgroundColor: 'rgba(0,0,0,0.65)',
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
    ...Shadows.card,
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
