import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Spacing } from '../../constants/theme';
import { DueCardWithContext, checkVoiceMatch } from '../../../lib/srs-engine';
import { getEffectiveCardLanguage } from '../../../lib/japanese-utils';
import { useReviewStore } from '../../stores/reviewStore';

export interface VoiceTranscriptAreaProps {
  transcript?: string;
  card: DueCardWithContext | null;
  isChecked: boolean;
  /** Aviso bajo la transcripción (p. ej. "No coincide · intento 1 de 3"). */
  feedback?: string | null;
  colors: {
    primary: string;
    text: string;
    textMuted: string;
  };
}

/** Muestra lo que el reconocedor entendió (en kana cuando es posible) y, si coincide, la palabra de la tarjeta encima. */
export const VoiceTranscriptArea = memo(function VoiceTranscriptArea({
  transcript: propTranscript,
  card,
  isChecked,
  feedback,
  colors,
}: VoiceTranscriptAreaProps) {
  const storeTranscript = useReviewStore((s) => s.speechTranscript);
  const transcript = (propTranscript ?? storeTranscript ?? '').trim();

  const match = transcript && card ? checkVoiceMatch(card, transcript, getEffectiveCardLanguage(card)) : null;
  const showCardAbove = Boolean(match?.isMatch && card?.displayText && card.displayText !== match.heard);

  return (
    <View style={[styles.area, isChecked && { opacity: 0 }]}>
      {transcript ? (
        <View style={styles.center}>
          {showCardAbove ? <Text style={[styles.above, { color: colors.primary }]}>{card!.displayText}</Text> : null}
          <Text style={[styles.heard, { color: colors.text }]}>“{match?.heard || transcript}”</Text>
          {feedback ? <Text style={[styles.feedback, { color: colors.textMuted }]}>{feedback}</Text> : null}
        </View>
      ) : (
        <Text style={[styles.placeholder, { color: colors.textMuted }]}>Pronuncia en voz alta...</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  area: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  above: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 1,
    textAlign: 'center',
  },
  heard: {
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  feedback: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
});
