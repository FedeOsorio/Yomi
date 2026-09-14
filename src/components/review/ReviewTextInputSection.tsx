import React, { memo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useReviewStore } from '../../stores/reviewStore';
import { Spacing, Typography } from '../../constants/theme';

export interface ReviewTextInputSectionProps {
  isIdeographic: boolean;
  colors: {
    text: string;
    textMuted: string;
    surfaceHighlight: string;
    border: string;
  };
}

/**
 * Componente enfocado para el formulario de respuestas en Modo Clásico (Teclado).
 * Aísla las suscripciones de inputReading e inputMeaning para que las pulsaciones
 * de teclado se reflejen de forma instantánea sin re-renderizar la pantalla de Review completa.
 */
export const ReviewTextInputSection = memo(function ReviewTextInputSection({
  isIdeographic,
  colors,
}: ReviewTextInputSectionProps) {
  const inputReading = useReviewStore((s) => s.inputReading);
  const inputMeaning = useReviewStore((s) => s.inputMeaning);
  const setInputReading = useReviewStore((s) => s.setInputReading);
  const setInputMeaning = useReviewStore((s) => s.setInputMeaning);

  return (
    <View style={styles.inputsSection}>
      {isIdeographic && (
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
            1. ¿Cómo se pronuncia? (Pinyin / Lectura):
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: colors.surfaceHighlight,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder="Ej. xue, ni3 hao3"
            placeholderTextColor={colors.textMuted}
            value={inputReading}
            onChangeText={setInputReading}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      )}

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
          {isIdeographic ? '2. ¿Qué significa?' : '¿Qué significa esta palabra?'}
        </Text>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: colors.surfaceHighlight,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          placeholder="Ej. aprender, estudiar"
          placeholderTextColor={colors.textMuted}
          value={inputMeaning}
          onChangeText={setInputMeaning}
          autoCapitalize="none"
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
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
});
