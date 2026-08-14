import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { db } from '../../../db';
import { words, decks } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { Colors, Spacing, Typography, Shadows } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { deleteWord } from '../../../lib/word-service';
import { speakText } from '../../../lib/audio-service';
import { SUPPORTED_LANGUAGES } from '../../../lib/deck-service';
import { getQuickJlptLevel } from '../../../lib/jlpt-data';
import { getQuickHskLevel } from '../../../lib/hsk-data';

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [deckWords, setDeckWords] = useState<any[]>([]);
  const [deckInfo, setDeckInfo] = useState<any>(null);

  const fetchWords = async () => {
    if (id) {
      const result = await db.select().from(words).where(eq(words.deckId, id));
      const d = await db.select().from(decks).where(eq(decks.id, id)).limit(1);
      const deckObj = d.length > 0 ? d[0] : null;
      if (deckObj) setDeckInfo(deckObj);

      const isJapaneseDeck = deckObj?.languageCode === 'ja-JP';
      const isChineseDeck = deckObj?.languageCode?.startsWith('zh');

      const processed = result.map((w) => {
        let level: string | undefined = undefined;
        if (w.auxiliaryInfo) {
          try {
            const parsed = JSON.parse(w.auxiliaryInfo);
            level = parsed.level;
          } catch {}
        }
        
        // Auto-resolución JLPT o HSK
        if (!level) {
          if (isJapaneseDeck) {
            level = getQuickJlptLevel(w.simplified);
          } else if (isChineseDeck) {
            const hskNum = getQuickHskLevel(w.simplified);
            if (hskNum) level = `HSK ${hskNum}`;
          }
        }

        // Limpiar cualquier romanización entre paréntesis para dejar únicamente Hiragana/Pinyin
        const rawReading = w.pinyinDisplay || '';
        const cleanReading = isJapaneseDeck
          ? rawReading.replace(/\s*\([^)]*\)/g, '').trim()
          : rawReading;

        return {
          ...w,
          resolvedLevel: level,
          displayReading: cleanReading,
        };
      });

      setDeckWords(processed);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchWords();
    }, [id])
  );

  const handleDeleteWord = (wordId: string, wordText: string) => {
    Alert.alert(
      'Eliminar palabra',
      `¿Estás seguro de que querés eliminar "${wordText}" del mazo y de tus repasos?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteWord(wordId);
            fetchWords();
          },
        },
      ]
    );
  };

  const handleSpeak = (text: string) => {
    const lang = deckInfo?.languageCode || 'zh-CN';
    speakText(text, lang);
  };

  const langMeta = SUPPORTED_LANGUAGES.find((l) => l.code === deckInfo?.languageCode);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {langMeta?.flag} {deckInfo?.name || 'Mazo'} ({deckWords.length})
        </Text>
        <TouchableOpacity
          style={styles.addWordBtn}
          onPress={() => router.push(`/search?deckId=${id}`)}
        >
          <Ionicons name="add" size={20} color={Colors.background} />
          <Text style={styles.addWordBtnText}>Agregar</Text>
        </TouchableOpacity>
      </View>
      
      {deckWords.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Este mazo no tiene palabras aún.</Text>
          <TouchableOpacity
            style={styles.emptyAddBtn}
            onPress={() => router.push(`/search?deckId=${id}`)}
          >
            <Ionicons name="add" size={18} color={Colors.background} style={{ marginRight: 4 }} />
            <Text style={styles.emptyAddBtnText}>Agregar primera palabra</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={deckWords}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: Spacing.xl }}
          renderItem={({ item }) => {
            let meaningsList: string[] = [];
            try {
              meaningsList = JSON.parse(item.meanings);
            } catch {
              meaningsList = [item.meanings];
            }

            const level = item.resolvedLevel;
            const formattedLevel = level
              ? level.startsWith('N')
                ? `JLPT ${level}`
                : level.startsWith('HSK')
                ? level
                : level
              : null;

            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => router.push(`/word/${item.id}`)}
              >
                <View style={styles.cardHeader}>
                  {/* Izquierda: Palabra + Badge de Lectura/Romaji/Hiragana/Pinyin */}
                  <View style={styles.row}>
                    <Text style={styles.char}>{item.simplified}</Text>

                    {item.displayReading && item.displayReading !== item.simplified ? (
                      <View style={styles.readingContainer}>
                        <Text style={styles.readingText}>{item.displayReading}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Derecha: Badge de Nivel JLPT/HSK al lado del Parlante y Borrar */}
                  <View style={styles.actionsRow}>
                    {formattedLevel ? (
                      <View style={styles.levelBadge}>
                        <Text style={styles.levelBadgeText}>{formattedLevel}</Text>
                      </View>
                    ) : null}

                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleSpeak(item.simplified);
                      }}
                    >
                      <Ionicons name="volume-medium-outline" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconActionBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteWord(item.id, item.simplified);
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.meanings} numberOfLines={2}>{meaningsList.join(', ')}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.viewDetailText}>Tocar para ver detalle y trazado</Text>
                  <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.md, backgroundColor: Colors.background, paddingTop: Spacing.xl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  backBtn: {
    padding: Spacing.xs,
    marginRight: Spacing.sm,
  },
  title: { ...Typography.h2, color: Colors.text, flex: 1 },
  addWordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginLeft: Spacing.xs,
  },
  addWordBtnText: {
    color: Colors.background,
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 2,
  },
  card: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 16,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  char: { ...Typography.chineseMedium, marginRight: Spacing.sm },
  readingContainer: {
    backgroundColor: Colors.surfaceHighlight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: Spacing.xs,
  },
  readingText: { ...Typography.body, color: Colors.primaryHover, fontWeight: '500' },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    marginRight: 6,
  },
  levelBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  iconActionBtn: {
    padding: Spacing.xs,
    marginLeft: 2,
  },
  meanings: { ...Typography.bodySmall, lineHeight: 20, color: Colors.textMuted },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  viewDetailText: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600',
    marginRight: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textMuted,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
  },
  emptyAddBtnText: {
    color: Colors.background,
    fontWeight: 'bold',
  },
});
