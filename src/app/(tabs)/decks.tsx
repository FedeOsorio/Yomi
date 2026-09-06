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
  deleteDeck,
  DeckWithStats,
  SUPPORTED_LANGUAGES,
  ALL_LANGUAGES,
} from '../../../lib/deck-service';
import { Colors, Shadows, Spacing, Typography } from '../../constants/theme';

export default function DecksScreen() {
  const [decks, setDecks] = useState<DeckWithStats[]>([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [selectedLang, setSelectedLang] = useState('ja-JP');
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

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) {
      Alert.alert('Atención', 'Ingresa un nombre para el mazo.');
      return;
    }
    setIsCreating(true);
    try {
      await createDeck(newDeckName.trim(), selectedLang);
      setNewDeckName('');
      setCreateModalVisible(false);
      fetchDecks();
    } catch (e) {
      Alert.alert('Error', 'No se pudo crear el mazo.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteDeck = (deckId: string, deckName: string) => {
    Alert.alert(
      'Eliminar mazo',
      `¿Estás seguro de que deseas eliminar "${deckName}" y todas sus palabras?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteDeck(deckId);
            fetchDecks();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Mis Mazos</Text>
        <TouchableOpacity
          style={styles.addHeaderBtn}
          onPress={() => setCreateModalVisible(true)}
        >
          <Ionicons name="add" size={22} color={Colors.background} />
          <Text style={styles.addHeaderBtnText}>Nuevo Mazo</Text>
        </TouchableOpacity>
      </View>

      {decks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="albums-outline" size={64} color={Colors.textMuted} />
          <Text style={styles.emptyText}>No tienes mazos creados aún.</Text>
          <TouchableOpacity
            style={styles.createFirstBtn}
            onPress={() => setCreateModalVisible(true)}
          >
            <Text style={styles.createFirstBtnText}>Crear tu primer mazo</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={decks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: Spacing.xl }}
          renderItem={({ item }) => {
            const langMeta = ALL_LANGUAGES.find((l) => l.code === item.languageCode);
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
                  <View style={styles.deckInfo}>
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
                      <Text style={styles.dueBadgeText}>{item.dueCount}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDeleteDeck(item.id, item.name);
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Modal Crear Mazo */}
      <Modal
        visible={createModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCreateModalVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Crear Nuevo Mazo</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Input Nombre */}
            <Text style={styles.label}>Nombre del mazo:</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ej. Japonés N5, Vocabulario Inglés"
              placeholderTextColor={Colors.textMuted}
              value={newDeckName}
              onChangeText={setNewDeckName}
              autoFocus={true}
            />

            {/* Selector de Idioma */}
            <Text style={styles.label}>Idioma de estudio:</Text>
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

            {/* Botón Crear */}
            <TouchableOpacity
              style={[styles.modalSubmitBtn, isCreating && { opacity: 0.7 }]}
              onPress={handleCreateDeck}
              disabled={isCreating}
            >
              <Text style={styles.modalSubmitText}>
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
  container: {
    flex: 1,
    padding: Spacing.md,
    backgroundColor: Colors.background,
    paddingTop: Spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: { ...Typography.h1, color: Colors.primary },
  addHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    ...Shadows.card,
  },
  addHeaderBtnText: {
    color: Colors.background,
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 4,
  },
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
  deckInfo: {
    flex: 1,
  },
  name: { ...Typography.h3, color: Colors.text },
  subtext: { ...Typography.bodySmall, color: Colors.textMuted, marginTop: 2 },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dueBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: Spacing.xs,
  },
  dueBadgeText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 11,
  },
  deleteBtn: {
    padding: Spacing.xs,
    marginRight: Spacing.xs,
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
    marginBottom: Spacing.md,
  },
  createFirstBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
  },
  createFirstBtnText: {
    color: Colors.background,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
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
  label: {
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
  modalSubmitBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    ...Shadows.card,
  },
  modalSubmitText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
