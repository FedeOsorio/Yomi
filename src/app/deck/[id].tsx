import { Ionicons } from '@expo/vector-icons';
import { eq } from 'drizzle-orm';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Modal, Platform, Pressable, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../../db';
import { decks, srsItems, words } from '../../../db/schema';
import { exportDeckToYomiFormat } from '../../../lib/anki-importer';
import { recoverDeckMediaAsync } from '../../../lib/anki-import-service';
import { deleteFileQuietly, listMediaFiles, mediaFileName } from '../../../lib/media-service';
import * as DocumentPicker from 'expo-document-picker';
import { speakCard } from '../../../lib/audio-service';
import { ALL_LANGUAGES, DeckAnswerMode, deleteDeck, setDeckAnswerMode } from '../../../lib/deck-service';
import { getQuickHskLevel } from '../../../lib/hsk-data';
import { cleanAndFormatMeanings } from '../../../lib/japanese-search';
import { classifyJapaneseWord, detectTextLanguage, isJapaneseDictionaryForm, formatJapaneseReading, katakanaToHiragana, romajiToHiragana } from '../../../lib/japanese-utils';
import { getQuickJlptLevel } from '../../../lib/jlpt-data';
import { addCardToReview, deleteWord, generateConjugationsForDeck, removeCardFromReviewByWordId, resolveJapaneseBaseForm } from '../../../lib/word-service';
import { hasAnkiCardRef, parseAux } from '../../../lib/word-aux';
import { useTheme } from '../../../providers/ThemeProvider';
import { ConjugationPracticeModal } from '../../components/ConjugationPracticeModal';
import { CustomCardData, CustomCardModal } from '../../components/CustomCardModal';
import { Shadows, Spacing, Typography } from '../../constants/theme';
import { useTranslation } from '../../i18n';
import { useImportProgressStore } from '../../stores/importProgressStore';
import { useDeckBrowseStore } from '../../stores/deckBrowseStore';
import { useSingleNavigation } from '../../hooks/useSingleNavigation';

// Minúsculas y sin tildes latinas (á, ü, tonos del pinyin). Se recompone con NFC para no perder el dakuten (が ≠ か).
const normalizeForSearch = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase().trim();

interface DeckWordCardProps {
  item: any;
  colors: any;
  onPress: (id: string) => void;
  onSpeak: (text: string, reading?: string, auxiliaryInfo?: string | null) => void;
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
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      activeOpacity={0.7}
      // Las tarjetas de Anki se dibujan con los campos originales: editar su texto no cambiaría nada, se abre el detalle
      onPress={() => (isCustomDeck && !hasAnkiCardRef(item.auxiliaryInfo) ? onEdit?.(item) : onPress(item.id))}
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

          {item.displayReading && item.displayReading !== item.simplified ? (
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
                onSpeak(item.simplified, item.displayReading, item.auxiliaryInfo);
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
      </View>

      {!isCustomDeck && (
        <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
          <Text style={[styles.viewDetailText, { color: colors.primary }]}>
            {t('deckDetail.viewDetailAndStroke')}
          </Text>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </View>
      )}

      {isCustomDeck && !item.isInReview && (
        <TouchableOpacity
          style={[styles.cardFooter, { borderTopColor: colors.border }]}
          onPress={(e) => {
            e.stopPropagation();
            onToggleReview?.(item.id, true);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.viewDetailText, { color: '#10B981' }]}>
            {t('deckDetail.addToReview')}
          </Text>
          <Ionicons name="add" size={15} color="#10B981" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

export default function DeckDetailScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Un solo movimiento por vez: varios toques rápidos no abren pantallas repetidas ni vuelven atrás de más
  const router = useSingleNavigation();
  const [deckWords, setDeckWords] = useState<any[]>([]);
  const [deckInfo, setDeckInfo] = useState<any>(null);
  const [conjugationModalVisible, setConjugationModalVisible] = useState(false);
  const [customCardModalVisible, setCustomCardModalVisible] = useState(false);
  const [editingCard, setEditingCard] = useState<CustomCardData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [missingMediaCount, setMissingMediaCount] = useState<number>(0);
  const [isRecoveringMedia, setIsRecoveringMedia] = useState<boolean>(false);
  const deferredQuery = useDeferredValue(searchQuery);
  const setBrowseList = useDeckBrowseStore((s) => s.setBrowseList);

  const isCustomDeck = deckInfo?.type === 'custom';
  const isJapaneseDeck = deckInfo?.languageCode === 'ja-JP';

  const filteredWords = useMemo(() => {
    const q = normalizeForSearch(deferredQuery);
    if (!q) return deckWords;
    // En japonés también se acepta escribir la lectura en katakana o romaji (sakura → さくら)
    const variants = new Set([q]);
    if (isJapaneseDeck) {
      variants.add(katakanaToHiragana(q));
      if (/[a-z]/.test(q)) variants.add(romajiToHiragana(q));
    }
    const terms = [...variants].filter(Boolean);
    return deckWords.filter((w) => terms.some((term) => w.searchIndex.includes(term)));
  }, [deckWords, deferredQuery, isJapaneseDeck]);

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
        const aux = parseAux(w.auxiliaryInfo);
        let level: string | undefined = aux.level;
        let category: string | undefined = aux.category;
        let conjugationEnabled: boolean | undefined =
          aux.conjugationEnabled !== undefined ? Boolean(aux.conjugationEnabled) : undefined;
        const cleanWord = (w.simplified || '').trim();
        const endsWithKanji = /[\u4e00-\u9faf]$/.test(cleanWord);
        const rawKun = aux.kunReading || '';
        // Forma de diccionario guardada, descartando valores corruptos de versiones viejas (p. ej. "u")
        const df = aux.dictionaryForm;
        let dictionaryForm: { kanji: string; reading?: string } | undefined =
          df?.kanji && df.kanji.length >= 2 && df.kanji !== 'u' && df.kanji !== 'う' && !/[\u4e00-\u9faf]$/.test(df.kanji)
            ? df
            : undefined;

        // Auto-resolución JLPT o HSK
        if (!level) {
          if (isJapaneseDeck) {
            level = getQuickJlptLevel(w.simplified);
          } else if (isChineseDeck) {
            const hskNum = getQuickHskLevel(w.simplified);
            if (hskNum) level = `HSK ${hskNum}`;
          }
        }

        // Limpiar cualquier romanización entre paréntesis o corchetes para dejar únicamente Hiragana/Pinyin y formatear On/Kun
        let rawReading = w.pinyinDisplay || '';
        if (isJapaneseDeck) {
          if (rawReading.includes('[') && rawReading.includes(']')) {
            const bracketMatch = rawReading.match(/\[([^\]]+)\]/);
            if (bracketMatch) {
              rawReading = bracketMatch[1].trim();
            }
          }
        }
        const cleanReading = isJapaneseDeck
          ? formatJapaneseReading(rawReading.replace(/\s*[\(\[（【][^\)\]）】]*[\)\]）】]/g, '').trim())
          : rawReading;

        // Si es una tarjeta de un solo kanji y no tiene dictionaryForm resuelto todavía, auto-resolver
        if (isJapaneseDeck && cleanWord.length === 1 && endsWithKanji && !dictionaryForm) {
          const resolved = resolveJapaneseBaseForm(cleanWord, cleanReading, rawKun);
          if (resolved) {
            dictionaryForm = { kanji: resolved.baseKanji, reading: resolved.baseReading };
            category = resolved.category;
            if (conjugationEnabled === undefined) conjugationEnabled = true;
          }
        }

        // Auto-clasificación si es japonés o corrección de falsos positivos en palabras kanji
        if (isJapaneseDeck) {
          if (dictionaryForm) {
            category = classifyJapaneseWord(dictionaryForm.kanji, dictionaryForm.reading || cleanReading);
          } else if (endsWithKanji && cleanWord.length > 1 && (category?.startsWith('Verbo') || category?.startsWith('Adjetivo -i'))) {
            category = classifyJapaneseWord(cleanWord, cleanReading);
          } else if (!category) {
            category = classifyJapaneseWord(cleanWord, cleanReading);
          }
        }

        const isBaseForm = isJapaneseDictionaryForm(cleanWord, cleanReading, category);
        const isConjugable =
          Boolean(dictionaryForm) ||
          (!endsWithKanji &&
            (category?.startsWith('Verbo') || category?.startsWith('Adjetivo')) &&
            (conjugationEnabled === true ||
              (conjugationEnabled === undefined && isBaseForm)));

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

        // Texto de búsqueda precalculado: palabra, lectura (también en hiragana), pinyin numérico y significados
        const searchIndex = normalizeForSearch(
          [
            w.simplified,
            w.traditional,
            cleanReading,
            isJapaneseDeck ? katakanaToHiragana(cleanReading) : '',
            w.pinyinNumeric,
            displayMeanings.join(' '),
          ]
            .filter(Boolean)
            .join(' ')
        );

        return {
          ...w,
          searchIndex,
          resolvedLevel: level,
          resolvedCategory: category,
          displayReading: cleanReading,
          isConjugable,
          dictionaryForm,
          displayMeanings,
          isInReview: activeSrsSet.has(w.id),
        };
      });

      setDeckWords(processed);

      // Archivos únicos que faltan en disco y se pueden recuperar (los `missing` nunca vinieron en el .apkg)
      const onDisk = listMediaFiles();
      const missingFiles = new Set<string>();
      for (const w of result) {
        for (const m of parseAux(w.auxiliaryInfo).media ?? []) {
          if (m.missing || !m.path) continue;
          const fileName = mediaFileName(m.path);
          if (fileName && !onDisk.has(fileName)) missingFiles.add(fileName);
        }
      }
      setMissingMediaCount(missingFiles.size);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      fetchWords();
    }, [fetchWords])
  );

  const handleDeleteWord = useCallback((wordId: string, wordText: string) => {
    Alert.alert(
      t('deckDetail.deleteWordTitle'),
      t('deckDetail.deleteWordConfirm', { text: wordText }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteWord(wordId);
            fetchWords();
          },
        },
      ]
    );
  }, [fetchWords, t]);

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
      Alert.alert(t('common.error'), t('deckDetail.updateReviewError'));
    }
  }, [fetchWords, t]);

  const handleRecoverMedia = async () => {
    let pickedUri: string | null = null;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const file = res.assets[0];
      pickedUri = file.uri;
      if (!file.name.toLowerCase().endsWith('.apkg')) {
        Alert.alert(t('common.error'), t('importDeck.alertInvalidApkgFormat'));
        return;
      }

      setIsRecoveringMedia(true);
      const result = await recoverDeckMediaAsync(id, file.uri);
      if (result.status === 'noMediaInPackage') {
        Alert.alert(t('common.notice'), t('deckDetail.noMediaInPackage'));
        return;
      }
      if (result.status === 'noMatchingMedia') {
        Alert.alert(t('common.notice'), t('deckDetail.noMatchingMedia'));
        return;
      }

      Alert.alert(
        t('importDeck.alertSuccessTitle'),
        t('deckDetail.mediaRecoveredSuccess', { count: result.recovered }) +
          (result.failed > 0 ? t('importDeck.mediaSkippedCount', { count: result.failed }) : '')
      );
      fetchWords();
    } catch (err) {
      Alert.alert(t('common.error'), t('deckDetail.mediaRecoverError'));
    } finally {
      setIsRecoveringMedia(false);
      deleteFileQuietly(pickedUri);
    }
  };

  const [menuVisible, setMenuVisible] = useState(false);

  // Mazos de idioma: qué se responde en el repaso (la importación lo fija según el mazo; acá lo decide el usuario)
  const answerMode: DeckAnswerMode = deckInfo?.answerMode === 'meaning' ? 'meaning' : 'reading';
  const handleChooseAnswerMode = () => {
    setMenuVisible(false);
    const choose = async (mode: DeckAnswerMode) => {
      await setDeckAnswerMode(id, mode);
      setDeckInfo((prev: any) => (prev ? { ...prev, answerMode: mode } : prev));
    };
    Alert.alert(t('deckDetail.answerModeTitle'), t('deckDetail.answerModeMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('deckDetail.answerReading'), onPress: () => choose('reading') },
      { text: t('deckDetail.answerMeaning'), onPress: () => choose('meaning') },
    ]);
  };

  const handleGenerateConjugations = async () => {
    setMenuVisible(false);
    if (!id) return;
    try {
      const res = await generateConjugationsForDeck(id);
      let msg = t('deckDetail.conjugationsCountMsg', {
        total: res.totalAnalyzed,
        verbs: res.verbsFound,
        adjectives: res.adjectivesFound,
        conjugable: res.totalConjugable,
      });

      if (res.deconjugatedCount > 0) {
        msg += t('deckDetail.deconjugatedMsg', { count: res.deconjugatedCount });
      }

      if (res.totalConjugable === 0) {
        msg += t('deckDetail.noConjugationsFound');
      }

      await fetchWords();

      if (res.totalConjugable > 0) {
        Alert.alert(
          t('deckDetail.conjugationsGenerated'),
          msg,
          [
            { text: t('common.ok'), style: 'cancel' },
            {
              text: t('deckDetail.practiceNow'),
              onPress: () => setConjugationModalVisible(true),
            },
          ]
        );
      } else {
        Alert.alert(t('deckDetail.generateConjugations'), msg);
      }
    } catch (e) {
      Alert.alert(t('common.error'), t('deckDetail.generateConjugationsError'));
    }
  };

  const handleExportDeck = async () => {
    setMenuVisible(false);
    if (!deckInfo || deckWords.length === 0) {
      Alert.alert(t('common.notice'), t('deckDetail.noWordsToExport'));
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
      Alert.alert(t('common.error'), t('deckDetail.exportError'));
    }
  };

  const handleDeleteDeck = () => {
    setMenuVisible(false);
    if (!id || !deckInfo) return;
    Alert.alert(
      t('deckDetail.deleteDeck'),
      t('deckDetail.deleteDeckConfirm', { name: deckInfo.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('deckDetail.deleteDeck'),
          style: 'destructive',
          onPress: async () => {
            const progress = useImportProgressStore.getState();
            progress.start(deckInfo.name, 0, t('decks.deletingDeck'));
            try {
              await deleteDeck(id);
            } finally {
              progress.finish();
            }
            router.back();
          },
        },
      ]
    );
  };

  const handleSpeak = useCallback((text: string, reading?: string, auxiliaryInfo?: string | null) => {
    // Mazo personalizado: cada texto puede estar en cualquier idioma, se detecta por su escritura
    const lang = isCustomDeck ? detectTextLanguage(text) : (deckInfo?.languageCode || 'zh-CN');
    speakCard({ displayText: text, displayReading: reading, auxiliaryInfo }, lang, { reading, useCardMedia: isCustomDeck });
  }, [isCustomDeck, deckInfo?.languageCode]);

  const handlePressWord = useCallback((wordId: string) => {
    // El detalle navega entre las palabras visibles en este momento (respetando la búsqueda)
    if (id) setBrowseList(id, filteredWords.map((w) => w.id));
    router.push(`/word/${wordId}`);
  }, [router, id, filteredWords, setBrowseList]);

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
            {deckInfo?.name || t('deckDetail.deck')}
          </Text>
        </View>

        <View style={styles.headerActions}>
          {/* Botón de 3 puntos (...) */}
          <TouchableOpacity
            style={styles.moreMenuBtn}
            onPress={() => setMenuVisible(true)}
            accessibilityLabel={t('decks.deckOptions')}
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
            <Text style={[styles.menuDropdownTitle, { color: colors.textMuted }]}>{t('deckDetail.optionsFor', { name: deckInfo?.name })}</Text>

            {deckWords.length > 0 && (
              <TouchableOpacity
                style={[styles.menuDropdownItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setMenuVisible(false);
                  router.push(`/(tabs)/review?deckId=${id}`);
                }}
              >
                <Ionicons name="flash" size={20} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={[styles.menuDropdownText, { color: colors.text, fontWeight: 'bold' }]}>{t('deckDetail.reviewDeck')}</Text>
              </TouchableOpacity>
            )}

            {!isCustomDeck && (
              <TouchableOpacity
                style={[styles.menuDropdownItem, { borderBottomColor: colors.border }]}
                onPress={handleChooseAnswerMode}
              >
                <Ionicons name="help-circle-outline" size={20} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={[styles.menuDropdownText, { color: colors.text }]}>
                  {t('deckDetail.answerModeTitle')}: {answerMode === 'meaning' ? t('deckDetail.answerMeaning') : t('deckDetail.answerReading')}
                </Text>
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
                <Text style={[styles.menuDropdownText, { color: colors.text }]}>{t('deckDetail.conjugationPractice')}</Text>
              </TouchableOpacity>
            )}

            {!isCustomDeck && deckInfo?.languageCode === 'ja-JP' && deckWords.length > 0 && (
              <TouchableOpacity
                style={[styles.menuDropdownItem, { borderBottomColor: colors.border }]}
                onPress={handleGenerateConjugations}
              >
                <Ionicons name="sparkles-outline" size={20} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={[styles.menuDropdownText, { color: colors.text }]}>{t('deckDetail.generateConjugations')}</Text>
              </TouchableOpacity>
            )}

            {isCustomDeck ? (
              <TouchableOpacity
                style={[styles.menuDropdownItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setMenuVisible(false);
                  router.push(`/deck/import?deckId=${id}&type=custom`);
                }}
              >
                <Ionicons name="cloud-download-outline" size={20} color="#10B981" style={{ marginRight: 10 }} />
                <Text style={[styles.menuDropdownText, { color: colors.text }]}>{t('deckDetail.importCustom')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.menuDropdownItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  setMenuVisible(false);
                  router.push(`/deck/import?deckId=${id}`);
                }}
              >
                <Ionicons name="cloud-download-outline" size={20} color={colors.primary} style={{ marginRight: 10 }} />
                <Text style={[styles.menuDropdownText, { color: colors.text }]}>{t('deckDetail.importWords')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.menuDropdownItem, { borderBottomColor: colors.border }]}
              onPress={handleExportDeck}
            >
              <Ionicons name="share-outline" size={20} color="#8B5CF6" style={{ marginRight: 10 }} />
              <Text style={[styles.menuDropdownText, { color: colors.text }]}>{t('deckDetail.exportDeck')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuDropdownItem, { borderBottomWidth: 0 }]}
              onPress={handleDeleteDeck}
            >
              <Ionicons name="trash-outline" size={20} color={colors.danger} style={{ marginRight: 10 }} />
              <Text style={[styles.menuDropdownText, { color: colors.danger }]}>{t('deckDetail.deleteDeck')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {deckWords.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name={isCustomDeck ? 'layers-outline' : 'book-outline'} size={48} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            {isCustomDeck ? t('deckDetail.emptyCustom') : t('deckDetail.emptyWords')}
          </Text>
          <View style={styles.emptyActionsRow}>
            <TouchableOpacity
              style={[styles.emptyAddBtn, { backgroundColor: isCustomDeck ? '#10B981' : colors.primary }]}
              onPress={() => (isCustomDeck ? setCustomCardModalVisible(true) : router.push(`/search?deckId=${id}`))}
            >
              <Ionicons name="add" size={18} color="#FFF" style={{ marginRight: 4 }} />
              <Text style={styles.emptyAddBtnText}>
                {isCustomDeck ? t('deckDetail.addCard') : t('deckDetail.addFirstWord')}
              </Text>
            </TouchableOpacity>

            {isCustomDeck && (
              <TouchableOpacity
                style={[
                  styles.emptyImportBtn,
                  { borderColor: '#10B981', backgroundColor: 'rgba(16, 185, 129, 0.08)' },
                ]}
                onPress={() => router.push(`/deck/import?deckId=${id}&type=custom`)}
              >
                <Ionicons name="cloud-download-outline" size={16} color="#10B981" style={{ marginRight: 6 }} />
                <Text style={[styles.emptyImportBtnText, { color: '#10B981' }]}>
                  {t('deckDetail.importCustom')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <>
          {missingMediaCount > 0 && (
            <View style={[styles.missingMediaBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.missingMediaTextCol}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="cloud-download-outline" size={18} color="#F59E0B" style={{ marginRight: 6 }} />
                  <Text style={[styles.missingMediaTitle, { color: colors.text }]}>
                    {missingMediaCount} {t('deckDetail.missingMediaFiles')}
                  </Text>
                </View>
                <Text style={[styles.missingMediaSubtitle, { color: colors.textMuted }]}>
                  {t('deckDetail.recoverMediaHint')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.recoverMediaBtn, { backgroundColor: colors.primary }]}
                disabled={isRecoveringMedia}
                onPress={handleRecoverMedia}
              >
                {isRecoveringMedia ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.recoverMediaBtnText}>{t('deckDetail.recoverMedia')}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('deckDetail.searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="never"
            />
            {searchQuery.length > 0 && (
              <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={t('common.close')}
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>

          <Animated.FlatList
            data={filteredWords}
            keyExtractor={keyExtractor}
            contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: 110 }}
            renderItem={renderWordItem}
            itemLayoutAnimation={LinearTransition.duration(200)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            removeClippedSubviews={Platform.OS === 'android'}
            maxToRenderPerBatch={10}
            windowSize={5}
            initialNumToRender={8}
            ListEmptyComponent={
              <Animated.View entering={FadeIn.duration(200)} style={styles.noResultsContainer}>
                <Ionicons name="search-outline" size={36} color={colors.textMuted} />
                <Text style={[styles.noResultsText, { color: colors.textMuted }]}>
                  {t('deckDetail.noSearchResults', { query: searchQuery.trim() })}
                </Text>
              </Animated.View>
            }
          />
        </>
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
          {isCustomDeck ? t('deckDetail.addCardFab') : t('deckDetail.addWordFab')}
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm + 4,
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    marginLeft: Spacing.sm,
    paddingVertical: 0,
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  noResultsText: {
    ...Typography.body,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  card: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
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
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  viewDetailText: {
    fontSize: 11,
    fontWeight: '600',
    marginRight: 4,
    includeFontPadding: false,
    textAlignVertical: 'center',
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
  emptyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md + 4,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 12,
  },
  emptyAddBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md + 4,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  emptyImportBtnText: {
    fontWeight: 'bold',
    fontSize: 14,
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
  missingMediaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm + 4,
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    gap: 10,
  },
  missingMediaTextCol: {
    flex: 1,
  },
  missingMediaTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  missingMediaSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  recoverMediaBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoverMediaBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
