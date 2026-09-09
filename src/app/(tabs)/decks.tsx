import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useState, useCallback } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  const [deckType, setDeckType] = useState<'language' | 'custom'>('language');
  const [selectedLang, setSelectedLang] = useState('ja-JP');
  const [isCreating, setIsCreating] = useState(false);

  const animProgress = React.useRef(new Animated.Value(0)).current;

  const backdropOpacity = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const sheetTranslateY = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [450, 0],
  });

  const openCreateModal = () => {
    setDeckType('language');
    setNewDeckName('');
    setCreateModalVisible(true);
    animProgress.setValue(0);
    Animated.timing(animProgress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeCreateModal = () => {
    Keyboard.dismiss();
    Animated.timing(animProgress, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setCreateModalVisible(false);
    });
  };

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
      await createDeck(
        newDeckName.trim(),
        deckType === 'custom' ? 'es-ES' : selectedLang,
        deckType
      );
      setNewDeckName('');
      closeCreateModal();
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
          onPress={openCreateModal}
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
            onPress={openCreateModal}
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
            const isCustom = item.type === 'custom';
            const langMeta = ALL_LANGUAGES.find((l) => l.code === item.languageCode);
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => router.push(`/deck/${item.id}`)}
              >
                <View style={styles.cardContent}>
                  <View
                    style={[
                      styles.flagBox,
                      {
                        backgroundColor: isCustom
                          ? 'rgba(16, 185, 129, 0.15)'
                          : 'rgba(59, 130, 246, 0.15)',
                      },
                    ]}
                  >
                    {isCustom ? (
                      <Ionicons name="layers" size={22} color="#10B981" />
                    ) : (
                      <Text style={styles.flagText}>{langMeta?.flag || '🌐'}</Text>
                    )}
                  </View>
                  <View style={styles.deckInfo}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.subtext}>
                      {isCustom ? 'Personalizado' : (langMeta?.label || 'Idiomas')} • {item.wordCount}{' '}
                      {item.wordCount === 1
                        ? (isCustom ? 'tarjeta' : 'palabra')
                        : (isCustom ? 'tarjetas' : 'palabras')}
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
        animationType="none"
        onRequestClose={closeCreateModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
          {/* Backdrop independiente para máxima fluidez y evitar re-rasterizado con alpha */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.6)', opacity: backdropOpacity },
            ]}
          />
          <Pressable style={StyleSheet.absoluteFill} onPress={closeCreateModal} />

          <Animated.View
            renderToHardwareTextureAndroid={true}
            style={[
              styles.modalContent,
              { transform: [{ translateY: sheetTranslateY }] },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Crear Nuevo Mazo</Text>
              <TouchableOpacity onPress={closeCreateModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Selector de Tipo de Mazo */}
            <Text style={styles.label}>Tipo de mazo:</Text>
            <View style={styles.typeSelectorRow}>
              <TouchableOpacity
                style={[
                  styles.typeCard,
                  deckType === 'language' && styles.typeCardSelectedLanguage,
                ]}
                activeOpacity={0.8}
                onPress={() => setDeckType('language')}
              >
                <View
                  style={[
                    styles.typeIconBox,
                    {
                      backgroundColor:
                        deckType === 'language'
                          ? 'rgba(59, 130, 246, 0.2)'
                          : Colors.surfaceHighlight,
                    },
                  ]}
                >
                  <Ionicons
                    name="language"
                    size={20}
                    color={deckType === 'language' ? Colors.primary : Colors.textMuted}
                  />
                </View>
                <View style={styles.typeInfo}>
                  <Text
                    style={[
                      styles.typeTitle,
                      deckType === 'language' && { color: Colors.primary },
                    ]}
                  >
                    Idiomas
                  </Text>
                  <Text style={styles.typeSubtitle}>Con diccionario asistido</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeCard,
                  deckType === 'custom' && styles.typeCardSelectedCustom,
                ]}
                activeOpacity={0.8}
                onPress={() => setDeckType('custom')}
              >
                <View
                  style={[
                    styles.typeIconBox,
                    {
                      backgroundColor:
                        deckType === 'custom'
                          ? 'rgba(16, 185, 129, 0.2)'
                          : Colors.surfaceHighlight,
                    },
                  ]}
                >
                  <Ionicons
                    name="layers"
                    size={20}
                    color={deckType === 'custom' ? '#10B981' : Colors.textMuted}
                  />
                </View>
                <View style={styles.typeInfo}>
                  <Text
                    style={[
                      styles.typeTitle,
                      deckType === 'custom' && { color: '#10B981' },
                    ]}
                  >
                    Personalizado
                  </Text>
                  <Text style={styles.typeSubtitle}>Pregunta y respuesta libre</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Input Nombre */}
            <Text style={styles.label}>Nombre del mazo:</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={
                deckType === 'custom'
                  ? 'Ej. Farmacología, Derecho Constitucional'
                  : 'Ej. Japonés N5, Vocabulario HSK 1'
              }
              placeholderTextColor={Colors.textMuted}
              value={newDeckName}
              onChangeText={setNewDeckName}
            />

            {/* Contenedor dinámico de altura fija: evita saltos de layout */}
            <View style={styles.dynamicSectionContainer}>
              {deckType === 'language' ? (
                <View style={styles.languageSectionBox}>
                  <Text style={[styles.label, { marginBottom: 6 }]}>Idioma de estudio:</Text>
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
                          <Text
                            style={[
                              styles.langChipText,
                              isSelected && styles.langChipTextSelected,
                            ]}
                          >
                            {lang.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <View style={styles.customNoticeBox}>
                  <Ionicons
                    name="information-circle-outline"
                    size={20}
                    color="#10B981"
                    style={{ marginRight: 10 }}
                  />
                  <Text style={styles.customNoticeText}>
                    Podrás armar preguntas y respuestas para ayudarte en tus estudios.
                  </Text>
                </View>
              )}
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
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
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
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  flagText: {
    fontSize: 24,
    lineHeight: 28,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
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
    fontSize: 22,
    color: Colors.text,
  },
  label: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginBottom: 6,
    fontWeight: '600',
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  typeCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceHighlight,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  typeCardSelectedLanguage: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  typeCardSelectedCustom: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  typeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  typeInfo: {
    flex: 1,
  },
  typeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  typeSubtitle: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  dynamicSectionContainer: {
    height: 64,
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  languageSectionBox: {
    height: 64,
    justifyContent: 'center',
  },
  customNoticeBox: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  customNoticeText: {
    flex: 1,
    fontSize: 12.5,
    color: Colors.text,
    lineHeight: 17,
    fontWeight: '500',
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
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceHighlight,
    paddingHorizontal: 12,
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
    marginRight: 6,
    textAlignVertical: 'center',
    includeFontPadding: false,
    marginTop: -2,
  },
  langChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    textAlignVertical: 'center',
    includeFontPadding: false,
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
