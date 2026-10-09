import { Ionicons } from '@expo/vector-icons';
import { Animated, ScrollView, StyleProp, StyleSheet, Text, TextStyle, TouchableOpacity, View } from 'react-native';
import { speakText } from '../../../lib/audio-service';
import { detectTextLanguage, formatJapaneseReading, toNormalizedHiragana } from '../../../lib/japanese-utils';
import { DueCardWithContext } from '../../../lib/srs-engine';
import { parseAux } from '../../../lib/word-aux';
import { Spacing, Typography } from '../../constants/theme';
import { useTranslation } from '../../i18n';
import { CardEvaluation, StudyMethod } from '../../stores/reviewStore';
import { ReviewTextInputSection } from './ReviewTextInputSection';
import { SyllableBreakdownView } from './SyllableBreakdownView';

type Colors = {
  primary: string;
  surface: string;
  surfaceHighlight: string;
  border: string;
  text: string;
  textMuted: string;
  danger: string;
};

interface ReviewCardProps {
  card: DueCardWithContext;
  lang: string;
  studyMethod: StudyMethod;
  isChecked: boolean;
  isCustomCard: boolean;
  evaluation: CardEvaluation | null;
  meaningsList: string[];
  colors: Colors;
  frontStyle: object;
  backStyle: object;
  onSubmitText: () => void;
}

/**
 * Lectura de la tarjeta con la parte que pronunció el usuario resaltada en verde
 * (p. ej. para 日 con lecturas "にち、ひ、か", si dijo "ひ" se resalta "ひ").
 */
function HighlightedReading({
  text,
  matched,
  style,
  mutedColor,
  numberOfLines,
}: {
  text: string;
  matched?: string;
  style: StyleProp<TextStyle>;
  mutedColor: string;
  numberOfLines: number;
}) {
  if (!matched) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }
  const normMatched = toNormalizedHiragana(matched);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {text.split(/([,、・•/|\s]+)/).map((tok, idx) => {
        const normTok = toNormalizedHiragana(
          tok.replace(/^(on|kun|音|訓)[:：\s]*/i, '').replace(/[・~～\s\(\)（）\-\.]/g, '').trim()
        );
        const isMatched =
          normTok && normMatched && (normTok === normMatched || normMatched.includes(normTok) || normTok.includes(normMatched));
        return (
          <Text key={idx} style={isMatched ? { color: '#10B981', fontWeight: '800' } : { color: mutedColor }}>
            {tok}
          </Text>
        );
      })}
    </Text>
  );
}

/** Tarjeta de repaso con giro 3D: frente con la pregunta, dorso con la respuesta. */
export function ReviewCard({
  card: currentCard,
  lang,
  studyMethod,
  isChecked,
  isCustomCard,
  evaluation,
  meaningsList,
  colors,
  frontStyle,
  backStyle,
  onSubmitText,
}: ReviewCardProps) {
  const { t } = useTranslation();
  const isIdeographic = lang.startsWith('zh') || lang.startsWith('ja');
  const isJapanese = lang.startsWith('ja');

  const { kanjiReadings } = parseAux(currentCard.auxiliaryInfo);

  return (
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
          frontStyle,
        ]}
      >
        {isCustomCard ? (
          <View style={styles.customFrontBox}>
            <View style={styles.customFrontHeaderRow}>
              <TouchableOpacity
                style={styles.customCleanSpeakerBtn}
                activeOpacity={0.7}
                onPress={() => speakText(currentCard.displayText, detectTextLanguage(currentCard.displayText))}
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
                onSubmit={onSubmitText}
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
          backStyle,
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
                onPress={() => {
                  const answer = meaningsList[0] || currentCard.displayMeaning;
                  speakText(answer, detectTextLanguage(answer));
                }}
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
                  {evaluation?.isReadingCorrect ? t('review.correct') : t('review.incorrect')}
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
                  <Text style={[styles.flipBackLabel, { color: colors.textMuted }]}>{t('wordDetail.reading')}</Text>
                  <HighlightedReading
                    text={isJapanese ? formatJapaneseReading(currentCard.displayReading) : currentCard.displayReading}
                    matched={isJapanese ? evaluation?.matchedReading : undefined}
                    style={[styles.flipHeroReadingSmall, { color: colors.primary, marginBottom: 4 }]}
                    mutedColor={colors.textMuted}
                    numberOfLines={2}
                  />

                  {/* Desglose On/Kun adicional para tarjetas de Kanji */}
                  {kanjiReadings && kanjiReadings !== currentCard.displayReading ? (
                    <HighlightedReading
                      text={kanjiReadings}
                      matched={isJapanese ? evaluation?.matchedReading : undefined}
                      style={[styles.flipKanjiReadingsSub, { color: colors.textMuted }]}
                      mutedColor={colors.textMuted}
                      numberOfLines={1}
                    />
                  ) : null}

                  {/* Desglose por sílaba Pinyin con círculos de porcentaje y barra de llenado (memoizado) */}
                  {evaluation?.voiceScore?.breakdown && evaluation.voiceScore.breakdown.length > 0 && (
                    <SyllableBreakdownView
                      breakdown={evaluation.voiceScore.breakdown}
                      colors={colors}
                    />
                  )}
                </>
              )}
              <Text style={[styles.flipBackLabel, { color: colors.textMuted }]}>{t('wordDetail.meanings')}</Text>
              <Text style={[styles.flipBackMeaningText, { color: colors.text }]} numberOfLines={2}>
                {meaningsList.join(', ')}
              </Text>
            </View>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  optionsGuidanceText: {
    position: 'absolute',
    top: -26,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
  },
  customFrontBox: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
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
});
