import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { db } from '../../../db';
import { words } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { Colors, Spacing, Typography, Shadows } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { deleteWord } from '../../../lib/word-service';

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams();
  const [deckWords, setDeckWords] = useState<any[]>([]);

  const fetchWords = async () => {
    if (typeof id === 'string') {
      const result = await db.select().from(words).where(eq(words.deckId, id));
      setDeckWords(result);
    }
  };

  useEffect(() => {
    fetchWords();
  }, [id]);

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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Palabras ({deckWords.length})</Text>
      
      {deckWords.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="book-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Este mazo no tiene palabras aún.</Text>
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
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.row}>
                    <Text style={styles.char}>{item.simplified}</Text>
                    <View style={styles.pinyinContainer}>
                      <Text style={styles.pinyin}>{item.pinyinDisplay}</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteWord(item.id, item.simplified)}
                  >
                    <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.meanings}>{meaningsList.join(', ')}</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.md, backgroundColor: Colors.background },
  title: { ...Typography.h2, marginBottom: Spacing.md, marginTop: Spacing.md, color: Colors.text },
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
    marginBottom: Spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  char: { ...Typography.chineseMedium, marginRight: Spacing.md },
  pinyinContainer: {
    backgroundColor: Colors.surfaceHighlight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pinyin: { ...Typography.body, color: Colors.primaryHover, fontWeight: '500' },
  deleteBtn: {
    padding: Spacing.xs,
  },
  meanings: { ...Typography.bodySmall, lineHeight: 20 },
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
  },
});
