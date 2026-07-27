import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getDecks } from '../../../lib/deck-service';
import { Colors, Shadows, Spacing, Typography } from '../../constants/theme';

export default function HomeScreen() {
  const [decks, setDecks] = useState<{ id: string; name: string }[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const router = useRouter();

  const fetchDecks = async () => {
    const d = await getDecks();
    setDecks(d);
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchDecks();
    }, [])
  );

  const handleOpenSearch = () => {
    setMenuVisible(false);
    router.push('/search');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mis Colecciones</Text>

      {decks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="albums-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No tienes mazos creados aún.</Text>
          <Text style={styles.emptySubtext}>Toca el botón + para buscar o agregar palabras.</Text>
        </View>
      ) : (
        <FlatList
          data={decks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => router.push(`/deck/${item.id}`)}
            >
              <View style={styles.cardContent}>
                <View style={styles.iconBox}>
                  <Ionicons name="journal" size={24} color={Colors.primary} />
                </View>
                <View>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.subtext}>Vocabulario guardado</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}

      {/* Floating Action Button (+) */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => setMenuVisible(true)}
      >
        <Ionicons name="add" size={30} color={Colors.background} />
      </TouchableOpacity>

      {/* Modal de Opciones Rápidas */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>¿Qué deseas agregar?</Text>

            <TouchableOpacity style={styles.menuOption} onPress={handleOpenSearch}>
              <View style={[styles.menuIconBox, { backgroundColor: '#3B82F6' }]}>
                <Ionicons name="text-outline" size={24} color="#FFF" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuOptionTitle}>Agregar pinyin / palabra</Text>
                <Text style={styles.menuOptionSub}>Busca en el diccionario o construye tu palabra</Text>
              </View>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.md, backgroundColor: Colors.background },
  title: { ...Typography.h1, marginBottom: Spacing.lg, color: Colors.primary },
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
  name: { ...Typography.h3, color: Colors.text },
  subtext: { ...Typography.bodySmall, color: Colors.textMuted },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    ...Typography.h3,
    color: Colors.textMuted,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.xl,
    right: Spacing.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.card,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  menuContainer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  menuTitle: {
    ...Typography.h3,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuOptionTitle: {
    ...Typography.body,
    fontWeight: 'bold',
    color: Colors.text,
  },
  menuOptionSub: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },
});
