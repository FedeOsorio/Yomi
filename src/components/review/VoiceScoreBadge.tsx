import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

/** Verde ≥ 90, ámbar ≥ 70, rojo por debajo. */
function scoreColor(score: number, danger: string) {
  return score >= 90 ? '#10B981' : score >= 70 ? '#F59E0B' : danger;
}

/** Porcentaje de precisión de la pronunciación (chino), debajo de la tarjeta. */
export function VoiceScoreBadge({ score, label, danger }: { score: number; label: string; danger: string }) {
  const color = scoreColor(score, danger);
  return (
    <View style={styles.outsideVoiceScoreWrapper}>
      <View style={[styles.outsideVoiceScoreBadge, { backgroundColor: color + '1F', borderColor: color }]}>
        <Ionicons name="mic" size={20} color={color} style={{ marginRight: 8 }} />
        <Text style={[styles.outsideVoiceScoreText, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outsideVoiceScoreWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  outsideVoiceScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.5,
  },
  outsideVoiceScoreText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
