import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { speakText } from '../../../lib/audio-service';
import { getStudyStats } from '../../../lib/srs-engine';
import {
  exportFullBackup,
  getLastBackupDate,
  parseBackupFile,
  restoreBackupPackage,
} from '../../../lib/backup-service';
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

  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const res = await getStudyStats();
      setStats(res);
      const backupTime = await getLastBackupDate();
      setLastBackupTime(backupTime);
    } catch (e) {}
  };

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [])
  );

  const handleTestAudio = (lang: string, sampleText: string) => {
    speakText(sampleText, lang);
  };

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await exportFullBackup();
      const nowIso = new Date().toISOString();
      setLastBackupTime(nowIso);
      Alert.alert(
        'Copia de seguridad generada',
        `Se empaquetaron ${res.stats.decksCount} mazos, ${res.stats.wordsCount} palabras y ${res.stats.srsCount} tarjetas de repaso. Podés guardarla en Google Drive o enviarla.`
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo generar la copia de seguridad.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreBackup = async () => {
    try {
      const docResult = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (docResult.canceled || !docResult.assets || docResult.assets.length === 0) {
        return;
      }

      const fileAsset = docResult.assets[0];
      setIsRestoring(true);

      const content = await FileSystem.readAsStringAsync(fileAsset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const pkg = parseBackupFile(content);

      const formattedDate = new Date(pkg.createdAt).toLocaleString();
      Alert.alert(
        'Restaurar Copia de Seguridad',
        `Se encontró una copia del ${formattedDate} con:\n• ${pkg.metadata.decksCount} mazos\n• ${pkg.metadata.wordsCount} palabras\n• ${pkg.metadata.srsCount} tarjetas de repaso (FSRS).\n\n¿Cómo deseás restaurar tus datos?`,
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => setIsRestoring(false) },
          {
            text: 'Combinar',
            onPress: async () => {
              try {
                const res = await restoreBackupPackage(pkg, 'merge');
                await fetchStats();
                Alert.alert(
                  'Restauración Exitosa',
                  `Se combinaron los datos correctamente: ${res.decksCount} mazos y ${res.wordsCount} palabras disponibles.`
                );
              } catch (err: any) {
                Alert.alert('Error al restaurar', err.message || 'Error durante la restauración.');
              } finally {
                setIsRestoring(false);
              }
            },
          },
          {
            text: 'Reemplazar Todo',
            style: 'destructive',
            onPress: async () => {
              try {
                const res = await restoreBackupPackage(pkg, 'replace');
                await fetchStats();
                Alert.alert(
                  'Restauración Exitosa',
                  `Se restauró la copia completa: ${res.decksCount} mazos y ${res.wordsCount} palabras.`
                );
              } catch (err: any) {
                Alert.alert('Error al restaurar', err.message || 'Error durante la restauración.');
              } finally {
                setIsRestoring(false);
              }
            },
          },
        ]
      );
    } catch (e: any) {
      setIsRestoring(false);
      Alert.alert('Error al leer el archivo', e.message || 'No se pudo leer el archivo de copia de seguridad.');
    }
  };

  const formattedLastBackup = lastBackupTime
    ? new Date(lastBackupTime).toLocaleString()
    : 'No se ha realizado ninguna copia';

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

      {/* Sección de Copia de Seguridad y Restauración (Google Drive / Archivo) */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Ionicons name="cloud-done-outline" size={20} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Copia de Seguridad y Restauración</Text>
        </View>

        <Text style={[styles.settingSub, { color: colors.textMuted, marginBottom: Spacing.sm }]}>
          Respaldá todos tus mazos, palabras y progresos SRS (FSRS) en Google Drive o archivos locales para no perderlos al cambiar o reinstalar el dispositivo.
        </Text>

        <View style={[styles.backupStatusBox, { backgroundColor: colors.surfaceHighlight }]}>
          <Ionicons name="time-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
          <Text style={[styles.backupStatusText, { color: colors.textMuted }]}>
            Última copia: <Text style={{ color: colors.text, fontWeight: '600' }}>{formattedLastBackup}</Text>
          </Text>
        </View>

        <View style={styles.backupActionsContainer}>
          <TouchableOpacity
            style={[styles.backupBtn, { backgroundColor: colors.primary }]}
            onPress={handleCreateBackup}
            disabled={isBackingUp || isRestoring}
            activeOpacity={0.8}
          >
            {isBackingUp ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.backupBtnText}>Crear copia de seguridad</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.restoreBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
            onPress={handleRestoreBackup}
            disabled={isBackingUp || isRestoring}
            activeOpacity={0.8}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="cloud-download-outline" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.restoreBtnText, { color: colors.text }]}>Restaurar desde archivo / Drive</Text>
              </>
            )}
          </TouchableOpacity>
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
          • Base de Datos: user_data.db (Ligera y respaldable) + dictionary.db.{'\n'}
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
  backupStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  backupStatusText: {
    fontSize: 12,
  },
  backupActionsContainer: {
    gap: 8,
    marginTop: Spacing.xs,
  },
  backupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    ...Shadows.card,
  },
  backupBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  restoreBtnText: {
    fontSize: 14,
    fontWeight: '600',
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

