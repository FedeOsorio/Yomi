import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getDecks } from '../../../lib/deck-service';
import { Colors, Shadows, Spacing, Typography } from '../../constants/theme';

export default function DecksScreen() {
  const [decks, setDecks] = useState<{ id: string; name: string }[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchDecks = async () => {
      const d = await getDecks();
      setDecks(d);
    };
    fetchDecks();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mis Mazos</Text>
      <FlatList
        data={decks}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: Spacing.xl }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/deck/${item.id}`)}
          >
            <View style={styles.cardContent}>
              <View style={styles.iconBox}>
                <Ionicons name="albums" size={24} color={Colors.primary} />
              </View>
              <Text style={styles.name}>{item.name}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.md, backgroundColor: Colors.background },
  title: { ...Typography.h1, marginBottom: Spacing.lg, marginTop: Spacing.xl, color: Colors.text },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 16,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    backgroundColor: Colors.surfaceHighlight,
    padding: Spacing.sm,
    borderRadius: 12,
    marginRight: Spacing.md,
  },
  name: { ...Typography.h3 },
});
