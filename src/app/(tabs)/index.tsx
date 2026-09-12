import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useState, useCallback, useEffect } from 'react';
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
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getDecksWithStats,
  createDeck,
  deleteDeck,
  DeckWithStats,
  SUPPORTED_LANGUAGES,
  ALL_LANGUAGES,
} from '../../../lib/deck-service';
import { onDataChanged } from '../../../lib/backup-service';
import { useTheme } from '../../../providers/ThemeProvider';
import { Shadows, Spacing, Typography } from '../../constants/theme';

export default function HomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [decks, setDecks] = useState<DeckWithStats[]>([]);
  const [menuVisible, setMenuVisible] = useState(false);
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

  // Cálculo dinámico para garantizar exactamente 16px de separación por encima de la barra en cualquier dispositivo
  const tabBottomMargin = Platform.OS === 'android' ? Math.max(insets.bottom + 4, 8) : Math.max(insets.bottom, 6);
  const fabBottomPosition = tabBottomMargin + 60 + 16;

  const fetchDecks = async () => {
    const d = await getDecksWithStats();
    setDecks(d);
  };

  useFocusEffect(
    useCallback(() => {
      fetchDecks();
    }, [])
  );

  useEffect(() => {
    return onDataChanged(() => {
      fetchDecks();
    });
  }, []);

  const handleOpenSearch = () => {
    setMenuVisible(false);
    router.push('/search');
  };

  const handleOpenCreateModal = () => {
    setMenuVisible(false);
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

  const handleCreateDeck = async () => {
    if (!newDeckName.trim()) {
      Alert.alert('Atención', 'Ingresa un nombre para el mazo.');
      return;
    }
    setIsCreating(true);
    try {
      const newId = await createDeck(
        newDeckName.trim(),
        deckType === 'custom' ? 'es-ES' : selectedLang,
        deckType
      );
      setNewDeckName('');
      closeCreateModal();
      await fetchDecks();
      router.push(`/deck/${newId}`);
    } catch (e) {
      Alert.alert('Error', 'No se pudo crear el mazo.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteDeck = (deckId: string, deckName: string) => {
    Alert.alert(
      'Eliminar mazo',
      `¿Estás seguro de que querés eliminar el mazo "${deckName}" y todas sus palabras guardadas? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar Mazo',
          style: 'destructive',
          onPress: async () => {
            await deleteDeck(deckId);
            await fetchDecks();
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {decks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="albums-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No tienes mazos creados aún.</Text>
          <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>Toca el botón + para crear un mazo de estudio.</Text>
        </View>
      ) : (
        <FlatList
          data={decks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 110 }}
          renderItem={({ item }) => {
            const isCustom = item.type === 'custom';
            const langMeta = ALL_LANGUAGES.find((l) => l.code === item.languageCode);
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                activeOpacity={0.7}
                onPress={() => router.push(`/deck/${item.id}`)}
                onLongPress={() => handleDeleteDeck(item.id, item.name)}
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
                  <View style={styles.deckInfoText}>
                    <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.subtext, { color: colors.textMuted }]}>
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
                      <Text style={styles.dueBadgeText}>Repasar hoy</Text>
                    </View>
                  )}
                  
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Floating Action Button (+) posicionado dinámicamente a 16px sobre el tope real de la barra */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: fabBottomPosition }]}
        activeOpacity={0.8}
        onPress={() => setMenuVisible(true)}
      >
        <Ionicons name="add" size={30} color="#FFF" />
      </TouchableOpacity>

      {/* Modal de Opciones Rápidas (+) */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.menuTitle, { color: colors.text }]}>¿Qué deseas hacer?</Text>

            <TouchableOpacity style={[styles.menuOption, { borderBottomColor: colors.border }]} onPress={handleOpenSearch}>
              <View style={[styles.menuIconBox, { backgroundColor: colors.primary }]}>
                <Ionicons name="text-outline" size={24} color="#FFF" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuOptionTitle, { color: colors.text }]}>Agregar palabra / tarjeta</Text>
                <Text style={[styles.menuOptionSub, { color: colors.textMuted }]}>
                  Busca o crea vocabulario en tus mazos
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.menuOption, { borderBottomColor: colors.border }]} onPress={handleOpenCreateModal}>
              <View style={[styles.menuIconBox, { backgroundColor: colors.secondary }]}>
                <Ionicons name="folder-outline" size={24} color="#FFF" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuOptionTitle, { color: colors.text }]}>Crear nuevo mazo</Text>
                <Text style={[styles.menuOptionSub, { color: colors.textMuted }]}>
                  Crea tarjetas para reforzar tus estudios
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuOption, { borderBottomWidth: 0 }]}
              onPress={() => {
                setMenuVisible(false);
                router.push('/deck/import');
              }}
            >
              <View style={[styles.menuIconBox, { backgroundColor: '#8B5CF6' }]}>
                <Ionicons name="cloud-download-outline" size={24} color="#FFF" />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={[styles.menuOptionTitle, { color: colors.text }]}>Importar (Anki / Yomi)</Text>
                <Text style={[styles.menuOptionSub, { color: colors.textMuted }]}>
                  Pega o carga listas de vocabulario externas o paquetes Yomi
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Modal Crear Mazo adaptativo al teclado */}
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
          <View style={styles.createModalOverlay}>
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
                styles.createModalContainer,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  transform: [{ translateY: sheetTranslateY }],
                },
              ]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Crear Nuevo Mazo</Text>
                <TouchableOpacity onPress={closeCreateModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Selector de Tipo de Mazo */}
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Tipo de mazo:</Text>
              <View style={styles.typeSelectorRow}>
                <TouchableOpacity
                  style={[
                    styles.typeCard,
                    { backgroundColor: colors.surfaceHighlight, borderColor: colors.border },
                    deckType === 'language' && {
                      borderColor: colors.primary,
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    },
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
                            : colors.surface,
                      },
                    ]}
                  >
                    <Ionicons
                      name="language"
                      size={20}
                      color={deckType === 'language' ? colors.primary : colors.textMuted}
                    />
                  </View>
                  <View style={styles.typeInfo}>
                    <Text
                      style={[
                        styles.typeTitle,
                        { color: colors.text },
                        deckType === 'language' && { color: colors.primary },
                      ]}
                    >
                      Idiomas
                    </Text>
                    <Text style={[styles.typeSubtitle, { color: colors.textMuted }]}>
                      Con diccionario asistido
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.typeCard,
                    { backgroundColor: colors.surfaceHighlight, borderColor: colors.border },
                    deckType === 'custom' && {
                      borderColor: '#10B981',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    },
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
                            : colors.surface,
                      },
                    ]}
                  >
                    <Ionicons
                      name="layers"
                      size={20}
                      color={deckType === 'custom' ? '#10B981' : colors.textMuted}
                    />
                  </View>
                  <View style={styles.typeInfo}>
                    <Text
                      style={[
                        styles.typeTitle,
                        { color: colors.text },
                        deckType === 'custom' && { color: '#10B981' },
                      ]}
                    >
                      Personalizado
                    </Text>
                    <Text style={[styles.typeSubtitle, { color: colors.textMuted }]}>
                      Pregunta y respuesta libre
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Input Nombre */}
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Nombre del mazo:</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.surfaceHighlight, color: colors.text, borderColor: colors.border }]}
                placeholder={
                  deckType === 'custom'
                    ? 'Ej. Farmacología, Derecho Constitucional'
                    : 'Ej. Japonés N5, Vocabulario HSK 1'
                }
                placeholderTextColor={colors.textMuted}
                value={newDeckName}
                onChangeText={setNewDeckName}
              />

              {/* Contenedor dinámico de altura fija: elimina cualquier salto visual */}
              <View style={styles.dynamicSectionContainer}>
                {deckType === 'language' ? (
                  <View style={styles.languageSectionBox}>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted, marginBottom: 6 }]}>Idioma de estudio:</Text>
                    <View style={styles.langGrid}>
                      {SUPPORTED_LANGUAGES.map((lang) => {
                        const isSelected = selectedLang === lang.code;
                        return (
                          <TouchableOpacity
                            key={lang.code}
                            style={[
                              styles.langChip,
                              { backgroundColor: colors.surfaceHighlight, borderColor: colors.border },
                              isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                            ]}
                            onPress={() => setSelectedLang(lang.code)}
                          >
                            <Text style={styles.langChipFlag}>{lang.flag}</Text>
                            <Text
                              style={[
                                styles.langChipText,
                                { color: colors.text },
                                isSelected && { color: '#FFF' },
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
                  <View
                    style={[
                      styles.customNoticeBox,
                      { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.25)' },
                    ]}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={20}
                      color="#10B981"
                      style={{ marginRight: 10 }}
                    />
                    <Text style={[styles.customNoticeText, { color: colors.text }]}>
                      Podrás armar preguntas y respuestas para ayudarte en tus estudios.
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.createDeckSubmitBtn, { backgroundColor: colors.primary }, isCreating && { opacity: 0.7 }]}
                onPress={handleCreateDeck}
                disabled={isCreating}
              >
                <Text style={styles.createDeckSubmitText}>
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
  container: { flex: 1, padding: Spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: 16,
    marginBottom: Spacing.md,
    borderWidth: 1,
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
  deckInfoText: {
    flex: 1,
  },
  name: { ...Typography.h3 },
  subtext: { ...Typography.bodySmall, marginTop: 2 },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteDeckCardBtn: {
    padding: Spacing.xs,
    marginRight: 4,
  },
  dueBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  dueBadgeText: {
    fontSize: 10,
    color: '#EF4444',
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 70,
  },
  emptyText: {
    ...Typography.h3,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    ...Typography.bodySmall,
    marginTop: Spacing.xs,
  },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
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
  createModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  menuContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    borderWidth: 1,
  },
  menuTitle: {
    ...Typography.h3,
    marginBottom: Spacing.md,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
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
  },
  menuOptionSub: {
    ...Typography.bodySmall,
  },
  createModalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.lg,
    borderWidth: 1,
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
  },
  fieldLabel: {
    ...Typography.bodySmall,
    marginBottom: 6,
    fontWeight: '600',
  },
  modalInput: {
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
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
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
    borderWidth: 1,
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
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  createDeckSubmitBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    ...Shadows.card,
  },
  createDeckSubmitText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
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
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
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
  },
  typeSubtitle: {
    fontSize: 10,
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
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  customNoticeText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '500',
  },
});
