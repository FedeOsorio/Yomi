import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getWordDetailWithRelations, deleteWord, WordDetailWithRelations } from '../../../lib/word-service';
import { speakText } from '../../../lib/audio-service';
import { Colors, Spacing, Typography, Shadows } from '../../constants/theme';
import { State } from 'ts-fsrs';
import { getQuickJlptLevel } from '../../../lib/jlpt-data';
import { getQuickHskLevel } from '../../../lib/hsk-data';

export default function WordDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [data, setData] = useState<WordDetailWithRelations | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDetail = async () => {
    if (typeof id === 'string') {
      setLoading(true);
      const res = await getWordDetailWithRelations(id);
      setData(res);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const handlePlayAudio = () => {
    if (!data) return;
    const lang = data.deck?.languageCode || 'zh-CN';
    speakText(data.word.simplified, lang);
  };

  const handleDelete = () => {
    if (!data) return;
    Alert.alert(
      'Eliminar palabra',
      `¿Deseas eliminar "${data.word.simplified}" de tu mazo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteWord(data.word.id);
            router.back();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
        <Text style={styles.errorText}>No se encontró la palabra.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { word, deck, srsItem, meaningsList, compoundWords, level } = data;
  const lang = deck?.languageCode || 'zh-CN';
  const isIdeographic = lang.startsWith('zh') || lang.startsWith('ja');

  // Resolución de nivel JLPT o HSK
  let activeLevel = level;
  if (!activeLevel) {
    if (lang.startsWith('ja')) {
      activeLevel = getQuickJlptLevel(word.simplified);
    } else if (lang.startsWith('zh')) {
      const hskNum = getQuickHskLevel(word.simplified);
      if (hskNum) activeLevel = `HSK ${hskNum}`;
    }
  }

  // Lectura limpia sin romanización en paréntesis
  const rawReading = word.pinyinDisplay || '';
  const cleanReading = lang.startsWith('ja')
    ? rawReading.replace(/\s*\([^)]*\)/g, '').trim()
    : rawReading;

  // Formato amigable de estado FSRS
  const getSrsStateLabel = (stateNum?: number) => {
    switch (stateNum) {
      case State.New:
        return { label: 'Nueva', color: '#3B82F6' };
      case State.Learning:
        return { label: 'Aprendiendo', color: '#F59E0B' };
      case State.Review:
        return { label: 'En Repaso', color: '#10B981' };
      case State.Relearning:
        return { label: 'Reaprendiendo', color: '#EF4444' };
      default:
        return { label: 'Sin repasar', color: Colors.textMuted };
    }
  };

  const srsStateInfo = getSrsStateLabel(srsItem?.state);

  return (
    <View style={styles.container}>
      {/* Header superior */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.deckName} numberOfLines={1}>
          {deck?.name || 'Vocabulario'}
        </Text>
        <TouchableOpacity onPress={handleDelete} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={22} color={Colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Tarjeta Principal de la Palabra */}
        <View style={styles.mainCard}>
          <View style={styles.wordHeader}>
            {/* Izquierda: Palabra + Badge de Lectura (Romaji/Pinyin) */}
            <View style={styles.wordTitleRow}>
              <Text style={isIdeographic ? styles.mainCharIdeographic : styles.mainCharAlphabetic}>
                {word.simplified}
              </Text>

              {cleanReading && cleanReading !== word.simplified ? (
                <View style={styles.inlineReadingBadge}>
                  <Text style={styles.inlineReadingText}>{cleanReading}</Text>
                </View>
              ) : null}
            </View>

            {/* Derecha: Badge de Nivel JLPT/HSK al lado del Parlante */}
            <View style={styles.rightActionsRow}>
              {activeLevel ? (
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>
                    {activeLevel.startsWith('HSK') || activeLevel.startsWith('JLPT')
                      ? activeLevel
                      : lang.startsWith('ja')
                      ? `JLPT ${activeLevel}`
                      : `HSK ${activeLevel}`}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.audioBtn}
                activeOpacity={0.8}
                onPress={handlePlayAudio}
              >
                <Ionicons name="volume-high" size={24} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Significados / Traducción */}
          <View style={styles.sectionBox}>
            <Text style={styles.sectionLabel}>Significado:</Text>
            <View style={styles.meaningsContainer}>
              {meaningsList.map((meaning, index) => (
                <View key={index} style={styles.meaningItem}>
                  <Text style={styles.meaningBullet}>•</Text>
                  <Text style={styles.meaningText}>{meaning}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Sección condicional: Trazado para idiomas ideográficos (Chino/Japonés) */}
        {isIdeographic && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="brush-outline" size={20} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Trazado y Caracteres</Text>
            </View>
            <View style={styles.strokeBox}>
              <Text style={styles.strokeCharPreview}>{word.simplified}</Text>
              <Text style={styles.strokeTip}>
                Total de caracteres: {word.simplified.length} {word.traditional && word.traditional !== word.simplified ? `| Tradicional: ${word.traditional}` : ''}
              </Text>
            </View>
          </View>
        )}

        {/* Sección condicional: 2-3 Palabras Compuestas / Ejemplos Comunes */}
        {isIdeographic && compoundWords.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="library-outline" size={20} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Palabras comunes con este carácter</Text>
            </View>
            <Text style={styles.sectionSub}>Ejemplos de uso frecuente en el diccionario:</Text>

            {compoundWords.map((comp) => (
              <View key={comp.id} style={styles.compoundItem}>
                <View style={styles.compoundTopRow}>
                  <Text style={styles.compoundChar}>{comp.simplified}</Text>
                  <Text style={styles.compoundPinyin}>{comp.pinyinDisplay}</Text>
                </View>
                <Text style={styles.compoundMeaning} numberOfLines={2}>
                  {comp.meanings.slice(0, 2).join(', ')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Ficha SRS FSRS */}
        {srsItem && (
          <View style={styles.srsCard}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="analytics-outline" size={20} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Estado de Memoria (SRS)</Text>
            </View>

            <View style={styles.srsGrid}>
              <View style={styles.srsStat}>
                <Text style={styles.srsStatLabel}>Estado</Text>
                <View style={[styles.srsBadge, { backgroundColor: srsStateInfo.color + '22' }]}>
                  <Text style={[styles.srsBadgeText, { color: srsStateInfo.color }]}>
                    {srsStateInfo.label}
                  </Text>
                </View>
              </View>

              <View style={styles.srsStat}>
                <Text style={styles.srsStatLabel}>Repasos</Text>
                <Text style={styles.srsStatValue}>{srsItem.reps} veces</Text>
              </View>

              <View style={styles.srsStat}>
                <Text style={styles.srsStatLabel}>Dificultad</Text>
                <Text style={styles.srsStatValue}>{srsItem.difficulty?.toFixed(1) || '0.0'}</Text>
              </View>

              <View style={styles.srsStat}>
                <Text style={styles.srsStatLabel}>Próximo repaso</Text>
                <Text style={styles.srsStatValue}>
                  {new Date(srsItem.due).toLocaleDateString()}
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: Spacing.xl,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: Spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconBtn: {
    padding: Spacing.xs,
  },
  deckName: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 60,
  },
  mainCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  wordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  wordTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  inlineReadingBadge: {
    backgroundColor: Colors.surfaceHighlight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: Spacing.xs,
  },
  inlineReadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primaryHover,
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: Spacing.xs,
  },
  levelBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  mainCharIdeographic: {
    ...Typography.chineseLarge,
    color: Colors.text,
  },
  mainCharAlphabetic: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.text,
  },
  audioBtn: {
    backgroundColor: Colors.surfaceHighlight,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionBox: {
    marginTop: Spacing.xs,
  },
  sectionLabel: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  meaningsContainer: {
    marginTop: 2,
  },
  meaningItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  meaningBullet: {
    color: Colors.primary,
    fontSize: 16,
    marginRight: 8,
  },
  meaningText: {
    ...Typography.body,
    color: Colors.text,
    flex: 1,
    lineHeight: 22,
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.body,
    fontWeight: '700',
    color: Colors.text,
    marginLeft: Spacing.xs,
  },
  sectionSub: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  strokeBox: {
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  strokeCharPreview: {
    fontSize: 48,
    color: Colors.primary,
    fontWeight: '300',
    marginVertical: Spacing.xs,
  },
  strokeTip: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    fontSize: 12,
  },
  compoundItem: {
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: 12,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  compoundTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  compoundChar: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginRight: Spacing.sm,
  },
  compoundPinyin: {
    fontSize: 13,
    color: Colors.primaryHover,
    fontWeight: '500',
  },
  compoundMeaning: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    fontSize: 12,
  },
  srsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  srsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  srsStat: {
    width: '48%',
    backgroundColor: Colors.surfaceHighlight,
    padding: Spacing.sm,
    borderRadius: 10,
    marginBottom: Spacing.xs,
  },
  srsStatLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  srsStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  srsBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  srsBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  errorText: {
    ...Typography.body,
    color: Colors.danger,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  backButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
  },
  backButtonText: {
    color: Colors.background,
    fontWeight: 'bold',
  },
});
