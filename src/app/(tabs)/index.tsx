import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useState, useCallback } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import {
  getDecksWithStats,
  createDeck,
  DeckWithStats,
  SUPPORTED_LANGUAGES,
} from '../../../lib/deck-service';
import { Colors, Shadows, Spacing, Typography } from '../../constants/theme';

export default function HomeScreen() {
  const [decks, setDecks] = useState<DeckWithStats[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [selectedLang, setSelectedLang] = useState('zh-CN');
  const [isCreating, setIsCreating] = useState(false);

  const router = useRouter();

  const fetchDecks = async () => {
    const d = await getDecksWithStats();
    setDecks(d);
  };

  useFocusEffect(
    useCallback(() => {
      fetchDecks();
    }, [])
  );

  const handleOpenSearch = () => {
    setMenuVisible(false);
    router.push('/search');
  };

  const handleOpenCreateModal = () => {
    setMenuVisible(false);
    setCreateModalVisible(true);
  };

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) {
      Alert.alert('Atención', 'Ingresa un nombre para el mazo.');
      return;
    }
    setIsCreating(true);
    try {
      const newId = await createDeck(newDeckName.trim(), selectedLang);
      setNewDeckName('');
      setCreateModalVisible(false);
      await fetchDecks();
      router.push(`/deck/${newId}`);
    } catch (e) {
      Alert.alert('Error', 'No se pudo crear el mazo.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Mis Colecciones</Text>

      {decks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="albums-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No tienes mazos creados aún.</Text>
          <Text style={styles.emptySubtext}>Toca el botón + para crear un mazo de estudio.</Text>
        </View>
      ) : (
        <FlatList
          data={decks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          renderItem={({ item }) => {
            const langMeta = SUPPORTED_LANGUAGES.find((l) => l.code === item.languageCode);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => router.push(`/deck/${item.id}`)}
              >
                <View style={styles.cardContent}>
                  <View style={styles.flagBox}>
                    <Text style={styles.flagText}>{langMeta?.flag || '📚'}</Text>
                  </View>
                  <View style={styles.deckInfoText}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.subtext}>
                      {langMeta?.label || 'General'} • {item.wordCount}{' '}
                      {item.wordCount === 1 ? 'palabra' : 'palabras'}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardRight}>
                  {item.dueCount > 0 && (
                    <View style={styles.dueBadge}>
                      <Text style={styles.dueBadgeText}>{item.dueCount} pendientes</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                </View>
              </TouchableOpacity>
            );
          }}
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

      {/* Modal de Opciones Rápidas (+) */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuContainer}>
            <Text style={styles.menuTitle}>¿Qué deseas hacer?</Text>

            <TouchableOpacity style={styles.menuOption} onPress={handleOpenSearch}>
              <View style={[styles.menuIconBox, { backgroundColor: '#3B82F6' }]}>
                <Ionicons name="text-outline" size={24} color="#FFF" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuOptionTitle}>Agregar palabra / tarjeta</Text>
                <Text style={styles.menuOptionSub}>
                  Busca o crea vocabulario en tus mazos
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuOption} onPress={handleOpenCreateModal}>
              <View style={[styles.menuIconBox, { backgroundColor: '#10B981' }]}>
                <Ionicons name="folder-outline" size={24} color="#FFF" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuOptionTitle}>Crear nuevo mazo</Text>
                <Text style={styles.menuOptionSub}>
                  Elige un idioma (Chino, Japonés, Inglés, Español, etc.)
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Modal Crear Mazo */}
      <Modal
        visible={createModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCreateModalVisible(false)}>
          <View style={styles.createModalContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Crear Nuevo Mazo</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Nombre del mazo:</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ej. Japonés N5, Vocabulario Inglés"
              placeholderTextColor={Colors.textMuted}
              value={newDeckName}
              onChangeText={setNewDeckName}
              autoFocus={true}
            />

            <Text style={styles.fieldLabel}>Idioma de estudio:</Text>
            <View style={styles.langGrid}>
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isSelected = selectedLang === lang.code;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[styles.langChip, isSelected && styles.langChipSelected]}
                    onPress={() => setSelectedLang(lang.code)}
                  >
                    <Text style={styles.langChipFlag}>{lang.flag}</Text>
                    <Text style={[styles.langChipText, isSelected && styles.langChipTextSelected]}>
                      {lang.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.createDeckSubmitBtn, isCreating && { opacity: 0.7 }]}
              onPress={handleCreateDeck}
              disabled={isCreating}
            >
              <Text style={styles.createDeckSubmitText}>
                {isCreating ? 'Creando...' : 'Crear Mazo'}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.md, backgroundColor: Colors.background, paddingTop: Spacing.xl },
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
    flex: 1,
  },
  flagBox: {
    backgroundColor: Colors.surfaceHighlight,
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  flagText: {
    fontSize: 22,
  },
  deckInfoText: {
    flex: 1,
  },
  name: { ...Typography.h3, color: Colors.text },
  subtext: { ...Typography.bodySmall, color: Colors.textMuted, marginTop: 2 },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dueBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: Spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  dueBadgeText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '700',
  },
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
  createModalContainer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    ...Typography.h2,
    color: Colors.text,
  },
  fieldLabel: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginBottom: 6,
    fontWeight: '600',
  },
  modalInput: {
    backgroundColor: Colors.surfaceHighlight,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  langGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.lg,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceHighlight,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  langChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  langChipFlag: {
    fontSize: 16,
    marginRight: 4,
  },
  langChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  langChipTextSelected: {
    color: Colors.background,
  },
  createDeckSubmitBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    ...Shadows.card,
  },
  createDeckSubmitText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
