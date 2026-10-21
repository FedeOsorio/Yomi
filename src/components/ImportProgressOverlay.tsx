import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslation } from '../i18n';
import { useImportProgressStore } from '../stores/importProgressStore';

/**
 * Progreso de una importación de Anki iniciada desde "Abrir con Yomi" (fuera de la pantalla de importación).
 * Cubre la app mientras dura, para que no se pueda navegar a un mazo a medio guardar.
 */
export function ImportProgressOverlay() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const progress = useImportProgressStore((s) => s.progress);

  if (!progress) return null;

  const isExtractingMedia = progress.total > 0 && progress.done < progress.total;
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.backdrop}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {progress.deckName}
        </Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          {isExtractingMedia
            ? t('importDeck.extractingMediaProgress', { done: progress.done, total: progress.total })
            : t('importDeck.savingCards')}
        </Text>
        {isExtractingMedia && (
          <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.barFill, { backgroundColor: colors.primary, width: `${percent}%` }]} />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    zIndex: 1000,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    width: '100%',
    marginTop: 4,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
});
