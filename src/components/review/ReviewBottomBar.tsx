import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Shadows, Spacing } from '../../constants/theme';
import { useTranslation } from '../../i18n';
import { CardEvaluation, StudyMethod } from '../../stores/reviewStore';

export type CustomCardAction = 'soon' | 'later' | 'next_day' | 'never';

interface ReviewBottomBarProps {
  studyMethod: StudyMethod;
  isCustomCard: boolean;
  isChecked: boolean;
  isProcessing: boolean;
  evaluation: CardEvaluation | null;
  bottomInset: number;
  colors: { primary: string; surface: string; surfaceHighlight: string; border: string; text: string; textMuted: string; danger: string };
  // Tarjetas personalizadas
  onShowCustomAnswer: () => void;
  onCustomAction: (action: CustomCardAction) => void;
  // Modo voz
  onVoiceGiveUp: () => void;
  onMarkIncorrect: () => void;
  onVoiceNext: () => void;
  // Modo escritura
  onGiveUp: () => void;
  onCheck: () => void;
  onNext: () => void;
}

/** Botones inferiores de la sesión; cambian según el tipo de tarjeta, el modo y si ya se respondió. */
export function ReviewBottomBar({
  studyMethod,
  isCustomCard,
  isChecked,
  isProcessing,
  evaluation,
  bottomInset,
  colors,
  onShowCustomAnswer,
  onCustomAction,
  onVoiceGiveUp,
  onMarkIncorrect,
  onVoiceNext,
  onGiveUp,
  onCheck,
  onNext,
}: ReviewBottomBarProps) {
  const { t } = useTranslation();
  return (
    <View
      style={[
        styles.bottomBar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: Math.max(bottomInset + 8, Spacing.md),
        },
        isCustomCard && styles.customBottomBar,
      ]}
    >
      {isCustomCard ? (
        !isChecked ? (
          <View style={styles.customBottomBarContent}>
            <TouchableOpacity
              style={[styles.showAnswerBtn, { backgroundColor: '#10B981' }]}
              activeOpacity={0.8}
              onPress={onShowCustomAnswer}
            >
              <Text style={styles.showAnswerBtnText}>{t('review.showAnswer')}</Text>
              <Ionicons name="eye-outline" size={20} color="#FFF" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.customBottomBarContent}>
            <Text style={[styles.customEvaluationPrompt, { color: colors.text }]}>
              {t('review.whenReviewAgain')}
            </Text>
            <View style={styles.customButtonRow}>
              {/* 1. Pronto (Azul) */}
              <TouchableOpacity
                style={[styles.customChoiceBtn, { backgroundColor: '#3B82F6' }, isProcessing && { opacity: 0.6 }]}
                activeOpacity={0.8}
                disabled={isProcessing}
                onPress={() => onCustomAction('soon')}
              >
                <Text style={styles.customChoiceTitle}>{t('review.soon')}</Text>
                <Text style={styles.customChoiceSub}>{t('review.soonSub')}</Text>
              </TouchableOpacity>

              {/* 2. Más tarde (Ámbar) */}
              <TouchableOpacity
                style={[styles.customChoiceBtn, { backgroundColor: '#F59E0B' }, isProcessing && { opacity: 0.6 }]}
                activeOpacity={0.8}
                disabled={isProcessing}
                onPress={() => onCustomAction('later')}
              >
                <Text style={styles.customChoiceTitle}>{t('review.later')}</Text>
                <Text style={styles.customChoiceSub}>{t('review.laterSub')}</Text>
              </TouchableOpacity>

              {/* 3. Otro día (Verde Esmeralda) */}
              <TouchableOpacity
                style={[styles.customChoiceBtn, { backgroundColor: '#10B981' }, isProcessing && { opacity: 0.6 }]}
                activeOpacity={0.8}
                disabled={isProcessing}
                onPress={() => onCustomAction('next_day')}
              >
                <Text style={styles.customChoiceTitle}>{t('review.nextDay')}</Text>
                <Text style={styles.customChoiceSub}>{t('review.nextDaySub')}</Text>
              </TouchableOpacity>

              {/* 4. Nunca (Rojo) */}
              <TouchableOpacity
                style={[styles.customChoiceBtn, { backgroundColor: '#EF4444' }, isProcessing && { opacity: 0.6 }]}
                activeOpacity={0.8}
                disabled={isProcessing}
                onPress={() => onCustomAction('never')}
              >
                <Text style={styles.customChoiceTitle}>{t('review.never')}</Text>
                <Text style={styles.customChoiceSub}>{t('review.neverSub')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      ) : studyMethod === 'voice' ? (
        <View style={styles.actionButtonsRow}>
          {isChecked ? (
            <>
              {evaluation?.isReadingCorrect && (
                <TouchableOpacity
                  style={[styles.markWrongBtn, { borderColor: colors.danger }]}
                  onPress={onMarkIncorrect}
                >
                  <Ionicons name="close-circle-outline" size={18} color={colors.danger} style={{ marginRight: 6 }} />
                  <Text style={[styles.markWrongBtnText, { color: colors.danger }]}>{t('review.markIncorrect')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                onPress={onVoiceNext}
              >
                <Text style={styles.nextBtnText}>{t('review.nextCardNow')}</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.giveUpBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border, flex: 1 }]}
              onPress={onVoiceGiveUp}
            >
              <Text style={[styles.giveUpBtnText, { color: colors.textMuted }]}>{t('review.iDontKnow')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        !isChecked ? (
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity style={[styles.giveUpBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]} onPress={onGiveUp}>
              <Text style={[styles.giveUpBtnText, { color: colors.textMuted }]}>{t('review.iDontKnow')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.checkBtn, { backgroundColor: colors.primary }]} onPress={onCheck}>
              <Text style={styles.checkBtnText}>{t('review.check')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: colors.primary }, isProcessing && { opacity: 0.7 }]}
              disabled={isProcessing}
              onPress={onNext}
            >
              {isProcessing ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={styles.nextBtnText}>{t('review.nextCard')}</Text>
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color="#FFF"
                    style={{ marginLeft: 6 }}
                  />
                </>
              )}
            </TouchableOpacity>
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    padding: Spacing.md,
    paddingBottom: 78,
    borderTopWidth: 1,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  giveUpBtn: {
    flex: 1,
    marginRight: Spacing.sm,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  giveUpBtnText: {
    fontWeight: '600',
    fontSize: 15,
  },
  checkBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  checkBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  markWrongBtn: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1.5,
    marginRight: Spacing.sm,
  },
  markWrongBtnText: {
    fontWeight: 'bold',
    fontSize: 15,
  },
  nextBtn: {
    flex: 1,
    width: '100%',
    minHeight: 50,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: 14,
  },
  nextBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  customBottomBar: {
    paddingTop: 6,
    paddingHorizontal: Spacing.md,
  },
  customBottomBarContent: {
    height: 82,
    justifyContent: 'center',
    width: '100%',
  },
  showAnswerBtn: {
    width: '100%',
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    ...Shadows.card,
  },
  showAnswerBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  customEvaluationPrompt: {
    fontSize: 13.5,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  customButtonRow: {
    flexDirection: 'row',
    gap: 6,
    width: '100%',
  },
  customChoiceBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 3,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  customChoiceTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  customChoiceSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
});
