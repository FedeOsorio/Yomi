import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { speakText } from '../../../lib/audio-service';
import { getStudyStats } from '../../../lib/srs-engine';
import { useTheme } from '../../../providers/ThemeProvider';
import { Shadows, Spacing } from '../../constants/theme';

export default function ProfileScreen() {
  const { isDark, toggleTheme, colors } = useTheme();
  const [stats, setStats] = useState({
    totalCards: 0,
    dueCards: 0,
    newCards: 0,
    learningCards: 0,
    reviewCards: 0,
  });

  const fetchStats = async () => {
    try {
      const res = await getStudyStats();
      setStats(res);
    } catch (e) { }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [])
  );

  const handleTestAudio = (lang: string, sampleText: string) => {
    speakText(sampleText, lang);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Tarjeta de Resumen / Perfil de Estudio */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.profileHeaderRow}>
          <View style={[styles.avatarBox, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="person" size={32} color={colors.primary} />
          </View>
          <View style={styles.profileTextInfo}>
            <Text style={[styles.userName, { color: colors.text }]}>Estudiante Yomi</Text>
            <Text style={[styles.userSub, { color: colors.textMuted }]}>
              {stats.totalCards} {stats.totalCards === 1 ? 'tarjeta guardada' : 'tarjetas guardadas'}
            </Text>
          </View>
        </View>

        {/* Métricas rápidas */}
        <View style={styles.statsGrid}>
          <View style={[styles.statBox, { backgroundColor: colors.surfaceHighlight }]}>
            <Text style={[styles.statNumber, { color: colors.primary }]}>{stats.totalCards}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total Tarjetas</Text>
          </View>

          <View style={[styles.statBox, { backgroundColor: colors.surfaceHighlight }]}>
            <Text style={[styles.statNumber, { color: '#EF4444' }]}>{stats.dueCards}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Pendientes Hoy</Text>
          </View>

          <View style={[styles.statBox, { backgroundColor: colors.surfaceHighlight }]}>
            <Text style={[styles.statNumber, { color: '#10B981' }]}>{stats.newCards}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Nivel 1 (Nuevas)</Text>
          </View>
        </View>
      </View>

      {/* Sección de Preferencias Visuales */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="color-palette-outline" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Apariencia e Interfaz</Text>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingTextGroup}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>Modo Oscuro</Text>
            <Text style={[styles.settingSub, { color: colors.textMuted }]}>
              {isDark ? 'Tema Deep Space (Oscuro)' : 'Tema Clean Slate (Claro)'}
            </Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFF"
          />
        </View>
      </View>

      {/* Sección de Motor de Audio TTS */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="volume-medium-outline" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Audio y Pronunciación Novedosa</Text>
        </View>

        <Text style={[styles.settingSub, { color: colors.textMuted, marginBottom: Spacing.sm }]}>
          Toca cualquier idioma para probar la voz nativa de tu dispositivo:
        </Text>

        <View style={styles.audioTestButtons}>
          <TouchableOpacity
            style={[styles.audioTestBtn, { backgroundColor: colors.surfaceHighlight }]}
            onPress={() => handleTestAudio('ja-JP', 'こんにちは')}
          >
            <Text style={styles.audioFlag}>🇯🇵</Text>
            <Text style={[styles.audioBtnText, { color: colors.text }]}>Japonés (こんにちは)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.audioTestBtn, { backgroundColor: colors.surfaceHighlight }]}
            onPress={() => handleTestAudio('zh-CN', '你好')}
          >
            <Text style={styles.audioFlag}>🇨🇳</Text>
            <Text style={[styles.audioBtnText, { color: colors.text }]}>Chino (你好)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.audioTestBtn, { backgroundColor: colors.surfaceHighlight }]}
            onPress={() => handleTestAudio('en-US', 'Hello')}
          >
            <Text style={styles.audioFlag}>🇺🇸</Text>
            <Text style={[styles.audioBtnText, { color: colors.text }]}>Inglés (Hello)</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Información del Sistema */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Sobre Yomi App</Text>
        </View>
        <Text style={[styles.infoText, { color: colors.textMuted }]}>
          • Motor de Repaso: Algoritmo FSRS v5 (Free Spaced Repetition Scheduler).{'\n'}
          • Diccionarios Locales: CC-CEDICT (Chino) y JMdict (Japonés).{'\n'}
          • Clasificación Oficial: Niveles JLPT N5-N1 y HSK 1-6.{'\n'}
          • Versión: 1.0.0 (Offline Native)
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.md,
  },
  scrollContent: {
    paddingBottom: 94,
  },
  card: {
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    ...Shadows.card,
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  profileTextInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  userSub: {
    fontSize: 14,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    width: '31%',
    padding: Spacing.sm,
    borderRadius: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: Spacing.xs,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  settingTextGroup: {
    flex: 1,
    marginRight: Spacing.md,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingSub: {
    fontSize: 13,
    marginTop: 2,
  },
  audioTestButtons: {
    marginTop: Spacing.xs,
  },
  audioTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: 10,
    marginBottom: Spacing.xs,
  },
  audioFlag: {
    fontSize: 18,
    marginRight: Spacing.sm,
  },
  audioBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  infoText: {
    fontSize: 13,
    lineHeight: 22,
  },
});
