import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Spacing } from '../../constants/theme';
import { DueCardWithContext, JA_NUMBERS, ZH_NUMBERS, checkVoiceMatch } from '../../../lib/srs-engine';
import { romajiToHiragana, getEffectiveCardLanguage } from '../../../lib/japanese-utils';

export interface SpokenRubyData {
  mainText: string;
  rubyText?: string;
}

export function getSpokenRubyDisplay(
  transcript: string,
  card: DueCardWithContext | null,
  lang: string
): SpokenRubyData {
  if (!transcript) return { mainText: '' };
  const trimmed = transcript.trim();
  const isJapanese = (lang || '').toLowerCase().startsWith('ja');
  const isChinese = (lang || '').toLowerCase().startsWith('zh');

  if (isJapanese) {
    if (JA_NUMBERS[trimmed]) {
      return {
        mainText: JA_NUMBERS[trimmed].kana,
        rubyText: JA_NUMBERS[trimmed].kanji,
      };
    }

    if (card) {
      const isMatch = checkVoiceMatch(card, transcript, lang);
      const cardHasKanji = /[\u4e00-\u9faf]/.test(card.displayText);

      if (isMatch) {
        if (cardHasKanji) {
          return {
            mainText: card.displayReading,
            rubyText: card.displayText,
          };
        } else {
          return {
            mainText: card.displayText,
          };
        }
      }
    }

    let converted = transcript;
    if (/[a-zA-Z]/.test(converted)) {
      converted = romajiToHiragana(converted);
    }
    return { mainText: converted };
  }

  if (isChinese) {
    if (ZH_NUMBERS[trimmed]) {
      return {
        mainText: ZH_NUMBERS[trimmed].pinyin,
        rubyText: ZH_NUMBERS[trimmed].hanzi,
      };
    }
    if (card && checkVoiceMatch(card, transcript, lang)) {
      return {
        mainText: card.displayReading,
        rubyText: card.displayText,
      };
    }
    return { mainText: transcript };
  }

  return { mainText: transcript };
}

export interface VoiceTranscriptAreaProps {
  transcript: string;
  card: DueCardWithContext | null;
  isChecked: boolean;
  colors: {
    primary: string;
    text: string;
    textMuted: string;
  };
}

export const VoiceTranscriptArea = memo(function VoiceTranscriptArea({
  transcript,
  card,
  isChecked,
  colors,
}: VoiceTranscriptAreaProps) {
  const spokenRuby = transcript
    ? getSpokenRubyDisplay(transcript, card, getEffectiveCardLanguage(card))
    : null;

  return (
    <View style={[styles.floatingTranscriptArea, isChecked && { opacity: 0 }]}>
      {transcript && spokenRuby ? (
        <View style={styles.rubySpokenContainer}>
          {spokenRuby.rubyText ? (
            <Text style={[styles.rubySpokenKanji, { color: colors.primary }]}>
              {spokenRuby.rubyText}
            </Text>
          ) : null}
          <Text style={[styles.rubySpokenKana, { color: colors.text }]}>
            “{spokenRuby.mainText}”
          </Text>
        </View>
      ) : (
        <Text style={[styles.floatingSpokenText, { color: colors.textMuted }]}>
          Pronuncia en voz alta...
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  floatingTranscriptArea: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  floatingSpokenText: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  rubySpokenContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rubySpokenKanji: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 1,
    textAlign: 'center',
  },
  rubySpokenKana: {
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
