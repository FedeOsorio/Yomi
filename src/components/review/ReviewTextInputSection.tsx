import React, { memo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useReviewStore } from '../../stores/reviewStore';
import { Spacing, Typography } from '../../constants/theme';
import { useTranslation } from '../../i18n';

export interface ReviewTextInputSectionProps {
  isIdeographic: boolean;
  languageCode?: string;
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
 * Componente enfocado para el formulario de respuestas en Modo Clásico (Teclado).
 * Aísla las suscripciones de inputReading e inputMeaning para que las pulsaciones
 * de teclado se reflejen de forma instantánea sin re-renderizar la pantalla de Review completa.
 */
export const ReviewTextInputSection = memo(function ReviewTextInputSection({
  isIdeographic,
  languageCode,
  onSubmit,
  colors,
}: ReviewTextInputSectionProps) {
  const inputReading = useReviewStore((s) => s.inputReading);
  const inputMeaning = useReviewStore((s) => s.inputMeaning);
  const setInputReading = useReviewStore((s) => s.setInputReading);
  const setInputMeaning = useReviewStore((s) => s.setInputMeaning);

  const meaningInputRef = useRef<TextInput>(null);
  const [focusedField, setFocusedField] = useState<'reading' | 'meaning' | null>(null);

  const { t } = useTranslation();
  const isJapanese = (languageCode || '').startsWith('ja');
  const isChinese = (languageCode || '').startsWith('zh');

  const readingPlaceholder = isJapanese
    ? t('review.placeholderReadingJa')
    : isChinese
      ? t('review.placeholderReadingZh')
      : t('review.pronunciation');

  return (
    <View style={styles.inputsSection}>
      {isIdeographic && (
        <View style={styles.inputGroup}>
          <View style={styles.labelRow}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>
              {t('review.howPronounced')}
            </Text>
          </View>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: colors.surfaceHighlight,
                color: colors.text,
                borderColor: focusedField === 'reading' ? colors.primary : colors.border,
              },
            ]}
            placeholder={readingPlaceholder}
            placeholderTextColor={colors.textMuted}
            value={inputReading}
            onChangeText={setInputReading}
            onFocus={() => setFocusedField('reading')}
            onBlur={() => setFocusedField(null)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => meaningInputRef.current?.focus()}
            blurOnSubmit={false}
          />
        </View>
      )}

      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={[styles.inputLabel, { color: colors.text }]}>
            {isIdeographic ? t('review.whatMeans') : t('review.whatWordMeans')}
          </Text>
        </View>
        <TextInput
          ref={meaningInputRef}
          style={[
            styles.textInput,
            {
              backgroundColor: colors.surfaceHighlight,
              color: colors.text,
              borderColor: focusedField === 'meaning' ? colors.primary : colors.border,
            },
          ]}
          placeholder={t('review.placeholderMeaning')}
          placeholderTextColor={colors.textMuted}
          value={inputMeaning}
          onChangeText={setInputMeaning}
          onFocus={() => setFocusedField('meaning')}
          onBlur={() => setFocusedField(null)}
          autoCapitalize="none"
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
    borderRadius: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
    fontSize: 15,
    borderWidth: 1.5,
  },
});
