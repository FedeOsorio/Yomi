import { Ionicons } from '@expo/vector-icons';
import { eq } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { memo, useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Platform, Pressable, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../../db';
import { decks, words, srsItems } from '../../../db/schema';
import { exportDeckToYomiFormat } from '../../../lib/anki-importer';
import { speakText } from '../../../lib/audio-service';
import { ALL_LANGUAGES, deleteDeck } from '../../../lib/deck-service';
import { getQuickHskLevel } from '../../../lib/hsk-data';
import { cleanAndFormatMeanings } from '../../../lib/japanese-search';
import { getQuickJlptLevel } from '../../../lib/jlpt-data';
import { deleteWord, addCardToReview, removeCardFromReviewByWordId } from '../../../lib/word-service';
import { classifyJapaneseWord, isJapaneseDictionaryForm } from '../../../lib/japanese-utils';
import { ConjugationPracticeModal } from '../../components/ConjugationPracticeModal';
import { CustomCardModal, CustomCardData } from '../../components/CustomCardModal';
import { useTheme } from '../../../providers/ThemeProvider';
import { Shadows, Spacing, Typography } from '../../constants/theme';

interface DeckWordCardProps {
  item: any;
  colors: any;
  onPress: (id: string) => void;
  onSpeak: (text: string) => void;
  onDelete: (id: string, text: string) => void;
  onEdit?: (item: any) => void;
  onToggleReview?: (id: string, shouldAdd: boolean) => void;
  isCustomDeck?: boolean;
}

const DeckWordCard = memo(function DeckWordCard({
  item,
  colors,
  onPress,
  onSpeak,
  onDelete,
  onEdit,
  onToggleReview,
  isCustomDeck,
}: DeckWordCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      activeOpacity={0.7}
      onPress={() => (isCustomDeck ? onEdit?.(item) : onPress(item.id))}
    >
      <View style={styles.cardHeader}>
        {/* Izquierda: Palabra o Pregunta (para mazos custom ocupa más ancho y hasta 2 líneas) */}
        <View style={[styles.wordColumn, isCustomDeck && styles.customWordColumn]}>
          <Text
            style={[
              styles.char,
              { color: colors.text },
              isCustomDeck && styles.customQuestionText,
            ]}
            numberOfLines={isCustomDeck ? 2 : 1}
            adjustsFontSizeToFit={!isCustomDeck}
          >
            {item.simplified}
          </Text>

          {!isCustomDeck && item.displayReading && item.displayReading !== item.simplified ? (
            <Text
              style={[styles.readingText, { color: colors.primaryHover }]}
              numberOfLines={1}
              adjustsFontSizeToFit={true}
            >
              {item.displayReading}
            </Text>
          ) : null}
        </View>

        {/* Derecha: Botones de Acción */}
        <View style={styles.actionsRow}>
          {!isCustomDeck && (
            <TouchableOpacity
              style={styles.iconActionBtn}
              onPress={(e) => {
                e.stopPropagation();
                onSpeak(item.simplified);
              }}
            >
              <Ionicons name="volume-medium-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={(e) => {
              e.stopPropagation();
              onDelete(item.id, item.simplified);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.cardAnswerRow}>
        <Text
          style={[
            styles.meanings,
            isCustomDeck && styles.customMeaningsText,
            { color: colors.textMuted },
          ]}
          numberOfLines={2}
        >
          {Array.isArray(item.displayMeanings) ? item.displayMeanings.join(', ') : item.displayMeanings || ''}
        </Text>

        {isCustomDeck && !item.isInReview && (
          <TouchableOpacity
            style={styles.reAddReviewBtn}
            onPress={(e) => {
              e.stopPropagation();
              onToggleReview?.(item.id, true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add" size={13} color="#10B981" style={{ marginRight: 2 }} />
            <Text style={styles.reAddReviewText}>SRS</Text>
          </TouchableOpacity>
        )}
      </View>

      {!isCustomDeck && (
        <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
          <Text style={[styles.viewDetailText, { color: colors.primary }]}>
            Tocar para ver detalle y trazado
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </View>
      )}
    </TouchableOpacity>
  );
});

export default function DeckDetailScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [deckWords, setDeckWords] = useState<any[]>([]);
  const [deckInfo, setDeckInfo] = useState<any>(null);
  const [conjugationModalVisible, setConjugationModalVisible] = useState(false);
  const [customCardModalVisible, setCustomCardModalVisible] = useState(false);
  const [editingCard, setEditingCard] = useState<CustomCardData | null>(null);

  const isCustomDeck = deckInfo?.type === 'custom';

  // Cálculo dinámico para garantizar exactamente 16px de separación por encima de la barra en cualquier dispositivo
  const tabBottomMargin = Platform.OS === 'android' ? Math.max(insets.bottom + 4, 8) : Math.max(insets.bottom, 6);
  const fabBottomPosition = tabBottomMargin + 60 + 16;

  const fetchWords = useCallback(async () => {
    if (id) {
      const result = await db.select().from(words).where(eq(words.deckId, id));
      const d = await db.select().from(decks).where(eq(decks.id, id)).limit(1);
      const deckObj = d.length > 0 ? d[0] : null;
      if (deckObj) setDeckInfo(deckObj);

      const activeSrs = await db
        .select({ itemId: srsItems.itemId })
        .from(srsItems)
        .where(eq(srsItems.itemType, 'word'));
      const activeSrsSet = new Set(activeSrs.map((s) => s.itemId));

      const isJapaneseDeck = deckObj?.languageCode === 'ja-JP';
      const isChineseDeck = deckObj?.languageCode?.startsWith('zh');

      const processed = result.map((w) => {
        let level: string | undefined = undefined;
        let category: string | undefined = undefined;
        let conjugationEnabled = false;

        if (w.auxiliaryInfo) {
          try {
            const parsed = JSON.parse(w.auxiliaryInfo);
            level = parsed.level;
            category = parsed.category;
            conjugationEnabled = Boolean(parsed.conjugationEnabled);
          } catch { }
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

        // Auto-clasificación si es japonés y no tenía categoría explícita
        if (!category && isJapaneseDeck) {
          category = classifyJapaneseWord(w.simplified, cleanReading);
        }

        const isBaseForm = isJapaneseDictionaryForm(w.simplified, cleanReading, category);
        const isConjugable =
          (conjugationEnabled === true && isBaseForm) ||
          (conjugationEnabled === undefined && isBaseForm && Boolean(category?.startsWith('Verbo') || category?.startsWith('Adjetivo')));

        const isCustomDeck = deckObj?.type === 'custom';

        // Pre-calcular y formatear significados: en mazo custom se preserva íntegra la respuesta sin recortar
        const displayMeanings = isCustomDeck
          ? (() => {
              try {
                const parsed = JSON.parse(w.meanings);
                return Array.isArray(parsed) ? parsed : [String(w.meanings)];
              } catch {
                return [w.meanings];
              }
            })()
          : cleanAndFormatMeanings(w.meanings).slice(0, 3);

        return {
          ...w,
          resolvedLevel: level,
          resolvedCategory: category,
          displayReading: cleanReading,
          isConjugable,
          displayMeanings,
          isInReview: activeSrsSet.has(w.id),
        };
      });

      setDeckWords(processed);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchWords();
    }, [fetchWords])
  );

  const handleDeleteWord = useCallback((wordId: string, wordText: string) => {
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
  }, [fetchWords]);

  const handleEditCard = useCallback((item: any) => {
    const rawAnswer = Array.isArray(item.displayMeanings)
      ? item.displayMeanings.join('\n')
      : String(item.displayMeanings || item.meanings || '');
    setEditingCard({
      id: item.id,
      question: item.simplified,
      answer: rawAnswer,
    });
    setCustomCardModalVisible(true);
  }, []);

  const handleToggleReview = useCallback(async (wordId: string, shouldAdd: boolean) => {
    try {
      if (shouldAdd) {
        await addCardToReview(wordId);
      } else {
        await removeCardFromReviewByWordId(wordId);
      }
      await fetchWords();
    } catch (e) {
      Alert.alert('Error', 'No se pudo actualizar el estado de repaso.');
    }
  }, [fetchWords]);

  const [menuVisible, setMenuVisible] = useState(false);

  const handleExportDeck = async () => {
    setMenuVisible(false);
    if (!deckInfo || deckWords.length === 0) {
      Alert.alert('Aviso', 'El mazo no tiene palabras para exportar.');
      return;
    }

    try {
      // Exportar en formato nativo Yomi estructurado
      const yomiJson = exportDeckToYomiFormat(
        { name: deckInfo.name, languageCode: deckInfo.languageCode },
        deckWords
      );

      await Share.share({
        title: `${deckInfo.name}.yomi`,
        message: yomiJson,
      });
    } catch (e) {
      Alert.alert('Error', 'No se pudo exportar el mazo.');
    }
  };

  const handleDeleteDeck = () => {
    setMenuVisible(false);
    if (!id || !deckInfo) return;
    Alert.alert(
      'Eliminar mazo',
      `¿Estás seguro de que querés eliminar el mazo "${deckInfo.name}" y todas las palabras/repasos que contiene? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar Mazo',
          style: 'destructive',
          onPress: async () => {
            await deleteDeck(id);
            router.back();
          },
        },
      ]
    );
  };

  const handleSpeak = useCallback((text: string) => {
    const lang = isCustomDeck ? 'es-ES' : (deckInfo?.languageCode || 'zh-CN');
    speakText(text, lang);
  }, [isCustomDeck, deckInfo?.languageCode]);

  const handlePressWord = useCallback((wordId: string) => {
    router.push(`/word/${wordId}`);
  }, [router]);

  const renderWordItem = useCallback(({ item }: { item: any }) => (
    <DeckWordCard
      item={item}
      colors={colors}
      onPress={handlePressWord}
      onSpeak={handleSpeak}
      onDelete={handleDeleteWord}
      onEdit={handleEditCard}
      onToggleReview={handleToggleReview}
      isCustomDeck={isCustomDeck}
    />
  ), [colors, handlePressWord, handleSpeak, handleDeleteWord, handleEditCard, handleToggleReview, isCustomDeck]);

  const keyExtractor = useCallback((item: any) => item.id, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 4 }]}>
      {/* Header superior de punta a punta de la pantalla */}
      <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.brandTitleContainer}>
          <Text style={[styles.brandText, { color: colors.primary }]}>Yomi</Text>
          <Text style={[styles.brandSep, { color: colors.textMuted }]}> • </Text>
          {isCustomDeck ? (
            <Ionicons
              name="layers"
              size={18}
              color="#10B981"
              style={{ marginRight: 6 }}
            />
          ) : (
            <Text style={styles.headerFlagText}>
              {ALL_LANGUAGES.find((l) => l.code === deckInfo?.languageCode)?.flag || '🌐'}
            </Text>
          )}
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {deckInfo?.name || 'Mazo'}
          </Text>
        </View>

        <View style={styles.headerActions}>
          {/* Botón de 3 puntos (...) */}
          <TouchableOpacity
            style={styles.moreMenuBtn}
            onPress={() => setMenuVisible(true)}
            accessibilityLabel="Opciones del mazo"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Menú Modal de Opciones del Mazo */}
      <Modal
        visible={menuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.menuDropdownTitle, { color: colors.textMuted }]}>Opciones de {deckInfo?.name}</Text>

            {deckWords.length > 0 && (
              <TouchableOpacity
                style={[styles.menuDropdownItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setMenuVisible(false);
                  router.push(`/(tabs)/review?deckId=${id}`);
                }}
              >
                <Ionicons name="flash" size={20} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={[styles.menuDropdownText, { color: colors.text, fontWeight: 'bold' }]}>Repasar mazo</Text>
              </TouchableOpacity>
            )}

            {!isCustomDeck && deckInfo?.languageCode === 'ja-JP' && deckWords.some((w) => w.isConjugable) && (
              <TouchableOpacity
                style={[styles.menuDropdownItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setMenuVisible(false);
                  setConjugationModalVisible(true);
                }}
              >
                <Ionicons name="sparkles" size={20} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={[styles.menuDropdownText, { color: colors.text }]}>Práctica de Conjugaciones</Text>
              </TouchableOpacity>
            )}

            {!isCustomDeck && (
              <TouchableOpacity
                style={[styles.menuDropdownItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setMenuVisible(false);
                  router.push(`/deck/import?deckId=${id}`);
                }}
              >
                <Ionicons name="cloud-download-outline" size={20} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={[styles.menuDropdownText, { color: colors.text }]}>Importar palabras (Anki / Yomi)</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.menuDropdownItem, { borderBottomColor: colors.border }]}
              onPress={handleExportDeck}
            >
              <Ionicons name="share-outline" size={20} color="#8B5CF6" style={{ marginRight: 10 }} />
              <Text style={[styles.menuDropdownText, { color: colors.text }]}>Exportar mazo (Yomi)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuDropdownItem, { borderBottomWidth: 0 }]}
              onPress={handleDeleteDeck}
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} style={{ marginRight: 10 }} />
              <Text style={[styles.menuDropdownText, { color: colors.danger }]}>Eliminar mazo</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {deckWords.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name={isCustomDeck ? 'layers-outline' : 'book-outline'} size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {isCustomDeck ? 'Este mazo no tiene tarjetas aún.' : 'Este mazo no tiene palabras aún.'}
          </Text>
          <TouchableOpacity
            style={[styles.emptyAddBtn, { backgroundColor: isCustomDeck ? '#10B981' : colors.primary }]}
            onPress={() => (isCustomDeck ? setCustomCardModalVisible(true) : router.push(`/search?deckId=${id}`))}
          >
            <Ionicons name="add" size={18} color="#FFF" style={{ marginRight: 4 }} />
            <Text style={styles.emptyAddBtnText}>
              {isCustomDeck ? 'Agregar primera tarjeta' : 'Agregar primera palabra'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={deckWords}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: 110 }}
          renderItem={renderWordItem}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
        />
      )}

      {/* Floating Extended FAB */}
      <TouchableOpacity
        style={[
          styles.fabExtended,
          {
            backgroundColor: isCustomDeck ? '#10B981' : colors.primary,
            bottom: fabBottomPosition,
          },
        ]}
        activeOpacity={0.8}
        onPress={() => {
          if (isCustomDeck) {
            setEditingCard(null);
            setCustomCardModalVisible(true);
          } else {
            router.push(`/search?deckId=${id}`);
          }
        }}
      >
        <Text style={styles.fabExtendedText}>
          {isCustomDeck ? '+ Añadir tarjeta' : '+ Añadir palabra'}
        </Text>
      </TouchableOpacity>

      {/* Modal para agregar o editar tarjetas personalizadas */}
      {id && (
        <CustomCardModal
          visible={customCardModalVisible}
          deckId={id}
          initialCard={editingCard}
          onClose={() => {
            setCustomCardModalVisible(false);
            setEditingCard(null);
          }}
          onCardAdded={fetchWords}
        />
      )}

      {/* Modal de Práctica de Conjugaciones */}
      {id && (
        <ConjugationPracticeModal
          visible={conjugationModalVisible}
          onClose={() => setConjugationModalVisible(false)}
          deckId={id}
          deckName={deckInfo?.name || 'Mazo'}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: Spacing.xs,
    marginRight: Spacing.xs,
  },
  brandTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  brandText: {
    fontSize: 20,
    fontWeight: '800',
  },
  brandSep: {
    fontSize: 18,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  conjugationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: Spacing.xs,
  },
  conjugationBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  studyDeckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    marginRight: Spacing.xs,
  },
  studyDeckBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  moreMenuBtn: {
    padding: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 80,
    paddingRight: Spacing.md,
  },
  menuDropdown: {
    width: 260,
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.sm,
    ...Shadows.card,
    elevation: 10,
  },
  menuDropdownTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    letterSpacing: 0.5,
  },
  menuDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuDropdownText: {
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    padding: Spacing.md,
    borderRadius: 16,
    marginBottom: Spacing.md,
    borderWidth: 1,
    ...Shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  wordColumn: {
    maxWidth: '55%',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  customWordColumn: {
    maxWidth: '85%',
    flex: 1,
  },
  customQuestionText: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  char: {
    ...Typography.chineseMedium,
    fontSize: 26,
  },
  readingText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryBadge: {
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 4,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
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
  },
  iconActionBtn: {
    padding: Spacing.xs,
    marginLeft: 2,
  },
  cardAnswerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    minHeight: 26,
  },
  customMeaningsText: {
    flex: 1,
    marginTop: 0,
    marginRight: Spacing.sm,
  },
  meanings: { ...Typography.bodySmall, lineHeight: 20, marginTop: 4 },
  reAddReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  reAddReviewText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
  },
  viewDetailText: {
    fontSize: 11,
    fontWeight: '600',
    marginRight: 4,
  },
  headerFlagText: {
    fontSize: 18,
    lineHeight: 22,
    marginRight: 6,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: 70,
  },
  emptyText: {
    ...Typography.body,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
  },
  emptyAddBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  fabExtended: {
    position: 'absolute',
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    ...Shadows.card,
    elevation: 8,
  },
  fabExtendedText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
