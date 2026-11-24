import { memo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useReviewStore } from '../../stores/reviewStore';
import { Spacing, Typography } from '../../constants/theme';
import { useTranslation } from '../../i18n';

export interface ReviewTextInputSectionProps {
  isIdeographic: boolean;
  languageCode?: string;
  /** Solo se pregunta el significado (palabras en kana: la lectura ya está a la vista) */
  meaningOnly?: boolean;
  onSubmit?: () => void;
  colors: {
    text: string;
    textMuted: string;
    surfaceHighlight: string;
    border: string;
    primary: string;
  };
}

/**
 * Componente enfocado para el formulario de respuestas en Modo Clásico con un solo input.
 * Permite responder indistintamente la lectura o el significado de la palabra.
 */
export const ReviewTextInputSection = memo(function ReviewTextInputSection({
  isIdeographic,
  languageCode,
  meaningOnly = false,
  onSubmit,
  colors,
}: ReviewTextInputSectionProps) {
  const inputReading = useReviewStore((s) => s.inputReading);
  const inputMeaning = useReviewStore((s) => s.inputMeaning);
  const setInputReading = useReviewStore((s) => s.setInputReading);
  const setInputMeaning = useReviewStore((s) => s.setInputMeaning);

  const [isFocused, setIsFocused] = useState(false);

  const { t } = useTranslation();

  const textValue = inputReading || inputMeaning || '';
  const handleChangeText = (val: string) => {
    setInputReading(val);
    setInputMeaning(val);
  };

  const label = meaningOnly
    ? t('review.whatWordMeans')
    : isIdeographic
      ? t('review.answerLabel')
      : t('review.whatWordMeans');

  const placeholder = meaningOnly
    ? t('review.placeholderMeaning')
    : isIdeographic
      ? t('review.placeholderUnified')
      : t('review.placeholderMeaning');

  return (
    <View style={styles.inputsSection}>
      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={[styles.inputLabel, { color: colors.text }]}>
            {label}
          </Text>
        </View>
        <TextInput
          style={[
            styles.textInput,
            {
              backgroundColor: colors.surfaceHighlight,
              color: colors.text,
              borderColor: isFocused ? colors.primary : colors.border,
            },
          ]}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={textValue}
          onChangeText={handleChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    ...Typography.bodySmall,
    fontWeight: '700',
    fontSize: 13,
  },
  textInput: {
    height: 50,
    borderRadius: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: 0,
    fontSize: 15,
    borderWidth: 1.5,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
});
