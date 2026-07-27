import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { db } from '../../../db';
import { words } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { Colors, Spacing, Typography } from '../../constants/theme';

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams();
  const [deckWords, setDeckWords] = useState<any[]>([]);

  useEffect(() => {
    const fetchWords = async () => {
      if (typeof id === 'string') {
        const result = await db.select().from(words).where(eq(words.deckId, id));
        setDeckWords(result);
      }
    };
    fetchWords();
  }, [id]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Palabras ({deckWords.length})</Text>
      
      <FlatList
        data={deckWords}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: Spacing.xl }}
        renderItem={({ item }) => {
          const meaningsList = JSON.parse(item.meanings);
          return (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.char}>{item.simplified}</Text>
                <View style={styles.pinyinContainer}>
                  <Text style={styles.pinyin}>{item.pinyinDisplay}</Text>
                </View>
              </View>
              <Text style={styles.meanings}>{meaningsList.join(', ')}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.md, backgroundColor: Colors.background },
  title: { ...Typography.h2, marginBottom: Spacing.md, marginTop: Spacing.md, color: Colors.text },
  card: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  char: { ...Typography.h2, marginRight: Spacing.md },
  pinyinContainer: {
    backgroundColor: Colors.surfaceHighlight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pinyin: { ...Typography.body, color: Colors.primaryHover },
  meanings: { ...Typography.bodySmall, lineHeight: 20 },
});
