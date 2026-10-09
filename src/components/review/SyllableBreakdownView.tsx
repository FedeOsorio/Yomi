import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { PinyinBreakdownItem } from '../../../lib/pinyin-utils';

/** Desglose de precisión por sílaba (pinyin) con un círculo de porcentaje por sílaba. */
interface SyllableBreakdownViewProps {
  breakdown: PinyinBreakdownItem[];
  colors: { surface: string; border: string; text: string; textMuted: string; primary: string; danger: string };
}

export const SyllableBreakdownView = memo(function SyllableBreakdownView({
  breakdown,
  colors,
}: SyllableBreakdownViewProps) {
  return (
    <View style={styles.breakdownContainer}>
      <Text style={[styles.breakdownSectionTitle, { color: colors.textMuted }]}>
        Precisión por Sílaba
      </Text>

      <View style={styles.syllablesRow}>
        {breakdown.map((item, bIndex) => {
          const sylScore = Math.min(Math.max(item.score, 0), 100);
          const strokeColor =
            sylScore >= 90 ? '#10B981' : sylScore >= 70 ? '#F59E0B' : colors.danger;
          const circRadius = 15.5;
          const circPerimeter = 2 * Math.PI * circRadius;
          const strokeDashoffset = circPerimeter - (circPerimeter * sylScore) / 100;

          return (
            <View
              key={bIndex}
              style={[
                styles.syllableCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.syllableHeader}>
                {item.char ? (
                  <Text style={[styles.syllableChar, { color: colors.text }]}>
                    {item.char}
                  </Text>
                ) : null}
                <Text style={[styles.syllableText, { color: colors.primary }]}>
                  {item.syllable}
                </Text>
              </View>

              {/* Círculo de porcentaje SVG */}
              <View style={styles.circleBox}>
                <Svg width={38} height={38} viewBox="0 0 38 38">
                  {/* Círculo de fondo tenue */}
                  <Circle
                    cx="19"
                    cy="19"
                    r={circRadius}
                    stroke={colors.border}
                    strokeWidth="3"
                    fill="transparent"
                  />
                  {/* Círculo de progreso animado/llenado */}
                  <Circle
                    cx="19"
                    cy="19"
                    r={circRadius}
                    stroke={strokeColor}
                    strokeWidth="3"
                    strokeDasharray={`${circPerimeter}`}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="transparent"
                    transform="rotate(-90 19 19)"
                  />
                </Svg>
                <View style={styles.circleScoreTextContainer}>
                  <Text style={[styles.circleScoreNumber, { color: strokeColor }]}>
                    {sylScore}%
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  breakdownContainer: {
    width: '100%',
    marginVertical: 4,
    alignItems: 'center',
  },
  breakdownSectionTitle: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  syllablesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
  },
  syllableCard: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 64,
  },
  syllableHeader: {
    alignItems: 'center',
    marginBottom: 2,
  },
  syllableChar: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  syllableText: {
    fontSize: 12,
    fontWeight: '700',
  },
  circleBox: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  circleScoreTextContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleScoreNumber: {
    fontSize: 10,
    fontWeight: '800',
  },
});
