import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { State } from 'ts-fsrs';
import { preloadAudioService, releaseAudioService, speakText, stopSpeech } from '../../../lib/audio-service';
import { getQuickHskLevel } from '../../../lib/hsk-data';
import { cleanAndFormatMeanings, extractKanjis, parseFurigana } from '../../../lib/japanese-search';
import { classifyJapaneseWord, formatJapaneseReading, toNormalizedHiragana } from '../../../lib/japanese-utils';
import { getKanjiEssentialReading, getKanjiJlptLevel, getQuickJlptLevel, JLPT_KANJI_READINGS } from '../../../lib/jlpt-data';
import { formatNextReviewTime, healCorruptedSrsIntervals } from '../../../lib/srs-engine';
import { getStorageItem, setStorageItem } from '../../../lib/storage-service';
import {
  CompoundWord,
  deleteWord,
  deleteWordMeaning,
  getCompoundWordsForChar,
  getWordDetailWithRelations,
  resolveJapaneseBaseForm,
  updateWordMeaningText,
  updateWordReading,
  updateWordSelectedMeanings,
  WordDetailWithRelations,
} from '../../../lib/word-service';
import { useTheme } from '../../../providers/ThemeProvider';
import { KanjiStrokeViewer, preloadStrokeSvg } from '../../components/kanji/KanjiStrokeViewer';
import { Shadows, Spacing, Typography } from '../../constants/theme';

export default function WordDetailScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [data, setData] = useState<WordDetailWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKanji, setSelectedKanji] = useState<string | null>(null);
  const [asyncCompounds, setAsyncCompounds] = useState<CompoundWord[]>([]);
  const [compoundsLoading, setCompoundsLoading] = useState(false);
  const [selectedMeanings, setSelectedMeanings] = useState<string[]>([]);
  const [editingMeaning, setEditingMeaning] = useState<string | null>(null);
  const [editMeaningText, setEditMeaningText] = useState('');
  const [isEditingReading, setIsEditingReading] = useState(false);
  const [editReadingText, setEditReadingText] = useState('');
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const fetchDetail = async () => {
    if (typeof id === 'string') {
      setLoading(true);
      await healCorruptedSrsIntervals().catch(() => { });
      const res = await getWordDetailWithRelations(id);
      setData(res);

      if (res) {
        const isCustom = res.deck?.type === 'custom';
        let parsedRaw: string[] = [];
        try {
          parsedRaw = JSON.parse(res.word.meanings);
          if (!Array.isArray(parsedRaw)) parsedRaw = [String(res.word.meanings)];
        } catch {
          parsedRaw = [String(res.word.meanings)];
        }

        const allMeanings = isCustom ? parsedRaw : cleanAndFormatMeanings(res.word.meanings);
        let currentSelected: string[] = allMeanings;

        if (res.word.auxiliaryInfo) {
          try {
            const parsed = JSON.parse(res.word.auxiliaryInfo);
            if (Array.isArray(parsed.selectedMeanings) && parsed.selectedMeanings.length > 0) {
              currentSelected = parsed.selectedMeanings;
            }
          } catch (e) { }
        } else if (res.srsItem?.displayMeaning) {
          try {
            const srsMeanings = JSON.parse(res.srsItem.displayMeaning);
            if (Array.isArray(srsMeanings) && srsMeanings.length > 0) {
              currentSelected = srsMeanings;
            }
          } catch (e) { }
        }

        // En mazo custom, o si currentSelected está vacío o no coincide, asegurar que todos queden seleccionados
        if (isCustom || currentSelected.length === 0 || !allMeanings.some((m) => currentSelected.includes(m))) {
          currentSelected = allMeanings;
        }

        setSelectedMeanings(currentSelected);
      }

      setLoading(false);
    }
  };

  const handleToggleMeaning = async (meaning: string) => {
    if (!data) return;
    let nextSelected: string[];

    if (selectedMeanings.includes(meaning)) {
      if (selectedMeanings.length <= 1) {
        Alert.alert('Aviso', 'Debes mantener al menos un significado seleccionado para repasar.');
        return;
      }
      nextSelected = selectedMeanings.filter((m) => m !== meaning);
    } else {
      nextSelected = [...selectedMeanings, meaning];
    }

    setSelectedMeanings(nextSelected);
    try {
      await updateWordSelectedMeanings(data.word.id, nextSelected);
    } catch (e) {
      console.warn('Error al guardar selección de significados:', e);
    }
  };

  const handleDeleteSingleMeaning = (meaning: string) => {
    if (!data) return;
    const currentList = cleanAndFormatMeanings(data.word.meanings);
    if (currentList.length <= 1) {
      Alert.alert('Aviso', 'No puedes eliminar el único significado de la palabra.');
      return;
    }

    Alert.alert(
      'Eliminar significado',
      `¿Deseas eliminar permanentemente "${meaning}" de esta palabra?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await deleteWordMeaning(data.word.id, meaning);
              // Actualizar estado local inmediatamente
              setData((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  word: {
                    ...prev.word,
                    meanings: JSON.stringify(res.updatedMeanings),
                  },
                };
              });
              setSelectedMeanings(res.updatedSelected);
            } catch (e) {
              Alert.alert('Error', 'No se pudo eliminar el significado.');
            }
          },
        },
      ]
    );
  };

  const handleStartEditMeaning = (meaning: string) => {
    setEditingMeaning(meaning);
    setEditMeaningText(meaning);
  };

  const handleSaveEditedMeaning = async () => {
    if (!data || !editingMeaning) return;
    const trimmed = editMeaningText.trim();
    if (!trimmed) {
      Alert.alert('Aviso', 'El significado no puede estar vacío.');
      return;
    }

    try {
      const res = await updateWordMeaningText(data.word.id, editingMeaning, trimmed);
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          word: {
            ...prev.word,
            meanings: JSON.stringify(res.updatedMeanings),
          },
        };
      });
      setSelectedMeanings(res.updatedSelected);
      setEditingMeaning(null);
      setEditMeaningText('');
    } catch (e) {
      Alert.alert('Error', 'No se pudo actualizar el significado.');
    }
  };

  const handleStartEditReading = () => {
    if (!data) return;
    const isJap = data.deck?.type !== 'custom' && (data.deck?.languageCode || '').startsWith('ja');
    if (!isJap) return;
    setEditReadingText(data.word.pinyinDisplay || '');
    setIsEditingReading(true);
  };

  const handleSaveEditedReading = async () => {
    if (!data) return;
    const isJap = data.deck?.type !== 'custom' && (data.deck?.languageCode || '').startsWith('ja');
    if (!isJap) return;
    const trimmed = editReadingText.trim();
    if (!trimmed) {
      Alert.alert('Aviso', 'La lectura no puede estar vacía.');
      return;
    }

    try {
      const res = await updateWordReading(data.word.id, trimmed);
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          word: {
            ...prev.word,
            pinyinDisplay: res.updatedReading,
            pinyinNumeric: res.updatedReading.toLowerCase(),
          },
          srsItem: prev.srsItem
            ? {
              ...prev.srsItem,
              displayReading: res.updatedReading,
            }
            : null,
        };
      });
      setIsEditingReading(false);
      speakText(trimmed, isJap ? 'ja-JP' : (data.deck?.languageCode || 'zh-CN'), trimmed);
    } catch (e) {
      Alert.alert('Error', 'No se pudo actualizar la lectura.');
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  // Carga asíncrona de palabras compuestas con caché local y feedback de carga
  useEffect(() => {
    if (!data) return;
    const langCode = data.deck?.languageCode || 'zh-CN';
    const char = data.word.simplified;
    const cacheKey = `yomi_compounds_cache_v2_${langCode}_${char}`;

    let isMounted = true;
    async function loadCompounds() {
      try {
        const cached = await getStorageItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            if (isMounted) {
              setAsyncCompounds(parsed);
              setCompoundsLoading(false);
            }
            return;
          }
        }
      } catch (e) { }

      if (isMounted) {
        setCompoundsLoading(true);
      }

      try {
        const compounds = await getCompoundWordsForChar(char, 3, langCode);
        if (isMounted) {
          setAsyncCompounds(compounds);
          setCompoundsLoading(false);
          if (compounds.length > 0) {
            setStorageItem(cacheKey, JSON.stringify(compounds));
          }
        }
      } catch (e) {
        if (isMounted) {
          setCompoundsLoading(false);
        }
      }
    }

    loadCompounds();
    return () => {
      isMounted = false;
    };
  }, [data]);

  // Precarga asíncrona en segundo plano de trazados de Kanji / Hanzi para apertura instantánea sin loading
  useEffect(() => {
    if (!data) return;
    const kanjis = extractKanjis(data.word.simplified);
    const isCh = (data.deck?.languageCode || 'zh-CN').startsWith('zh');
    kanjis.forEach((char) => {
      preloadStrokeSvg(char, isCh);
    });
  }, [data]);

  // Precarga automática del motor de audio (TTS) al entrar a la pantalla y liberación al salir
  useEffect(() => {
    let isMounted = true;
    if (data) {
      const langCode = data.deck?.languageCode || 'zh-CN';
      preloadAudioService(langCode).then(() => {
        if (isMounted) setIsAudioReady(true);
      });
    }

    return () => {
      isMounted = false;
      stopSpeech();
      releaseAudioService();
    };
  }, [data?.deck?.languageCode]);

  const handlePlayAudio = () => {
    if (!data || isPlayingAudio) return;
    const lang = data.deck?.languageCode || 'zh-CN';
    const rawReading = data.word.pinyinDisplay || '';
    const cleanReading = lang.startsWith('ja')
      ? rawReading.replace(/\s*\([^)]*\)/g, '').trim()
      : rawReading;
    setIsPlayingAudio(true);
    speakText(data.word.simplified, lang, cleanReading, {
      onStart: () => setIsPlayingAudio(true),
      onDone: () => setIsPlayingAudio(false),
      onStopped: () => setIsPlayingAudio(false),
      onError: () => setIsPlayingAudio(false),
    });
  };

  const handleDelete = () => {
    if (!data) return;
    Alert.alert(
      'Eliminar palabra',
      `¿Deseas eliminar "${data.word.simplified}" de tu mazo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteWord(data.word.id);
            router.back();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={[styles.errorText, { color: colors.danger }]}>No se encontró la palabra.</Text>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { word, deck, srsItem, meaningsList, compoundWords, level, category } = data;
  const isCustomDeck = deck?.type === 'custom';
  const displayMeaningsList = isCustomDeck
    ? (() => {
      try {
        const parsed = JSON.parse(word.meanings);
        return Array.isArray(parsed) ? parsed : [String(word.meanings)];
      } catch {
        return [word.meanings];
      }
    })()
    : cleanAndFormatMeanings(word.meanings);

  const lang = deck?.languageCode || 'zh-CN';
  const isChinese = !isCustomDeck && lang.startsWith('zh');
  const isJapanese = !isCustomDeck && lang.startsWith('ja');
  const isIdeographic = isChinese || isJapanese;

  // Resolución de nivel JLPT o HSK
  let activeLevel = level;
  if (!activeLevel) {
    if (lang.startsWith('ja')) {
      activeLevel = getQuickJlptLevel(word.simplified);
    } else if (lang.startsWith('zh')) {
      const hskNum = getQuickHskLevel(word.simplified);
      if (hskNum) activeLevel = `HSK ${hskNum}`;
    }
  }

  // Lectura limpia sin romanización en paréntesis y formateada On/Kun
  const rawReading = word.pinyinDisplay || '';
  const cleanReading = lang.startsWith('ja')
    ? formatJapaneseReading(rawReading.replace(/\s*\([^)]*\)/g, '').trim())
    : rawReading;

  let parsedAux: Record<string, any> = {};
  if (word.auxiliaryInfo) {
    try {
      parsedAux = JSON.parse(word.auxiliaryInfo);
    } catch { }
  }

  const cleanWord = (word.simplified || '').trim();
  const endsWithKanji = /[\u4e00-\u9faf]$/.test(cleanWord);
  const isSingleKanji = isJapanese && word.simplified.length === 1 && /[\u4e00-\u9faf]/.test(word.simplified);
  const kanjiMeta = isSingleKanji ? getKanjiEssentialReading(word.simplified, parsedAux.onReading, parsedAux.kunReading) : null;
  const kanjiReadingsDisplay = parsedAux.kanjiReadings || kanjiMeta?.kanjiReadings;
  const onReadingCandidate = parsedAux.onReading || kanjiMeta?.onReading;
  const kunReadingCandidate = parsedAux.kunReading || kanjiMeta?.kunReading;

  // Obtener lecturas On y Kun para mostrar como botones interactivos
  let rawOn = onReadingCandidate || '';
  if (!rawOn && kanjiReadingsDisplay) {
    const match = kanjiReadingsDisplay.match(/On:\s*([^|\n]+)/i);
    if (match) rawOn = match[1];
  }
  if (!rawOn && isSingleKanji) {
    const jlpt = JLPT_KANJI_READINGS[word.simplified];
    if (jlpt?.on) rawOn = jlpt.on;
  }
  const onReadingsList: string[] = rawOn ? rawOn.split(/[,、\/]/).map((s: string) => s.trim()).filter(Boolean) : [];

  let rawKun = kunReadingCandidate || '';
  if (!rawKun && kanjiReadingsDisplay) {
    const match = kanjiReadingsDisplay.match(/Kun:\s*([^|\n]+)/i);
    if (match) rawKun = match[1];
  }
  if (!rawKun && isSingleKanji) {
    const jlpt = JLPT_KANJI_READINGS[word.simplified];
    if (jlpt?.kun) rawKun = jlpt.kun;
  }
  const kunReadingsList: string[] = rawKun ? rawKun.split(/[,、\/]/).map((s: string) => s.trim()).filter(Boolean) : [];

  const rawBaseKanji = parsedAux.dictionaryForm?.kanji;
  let resolvedBase: { baseKanji: string; baseReading: string; category: string } | null = null;
  if (isJapanese && isSingleKanji && !rawBaseKanji) {
    resolvedBase = resolveJapaneseBaseForm(cleanWord, cleanReading, rawKun);
  }

  const effectiveBaseKanji = rawBaseKanji || resolvedBase?.baseKanji;
  const baseKanji =
    effectiveBaseKanji &&
      effectiveBaseKanji.length >= 2 &&
      effectiveBaseKanji !== 'u' &&
      effectiveBaseKanji !== 'う' &&
      !/[\u4e00-\u9faf]$/.test(effectiveBaseKanji)
      ? effectiveBaseKanji
      : undefined;

  const hasKanjiReadings = onReadingsList.length > 0 || kunReadingsList.length > 0;

  const handleSelectQuickReading = async (readingRaw: string) => {
    if (!data) return;
    const clean = readingRaw.replace(/[・\-\~]/g, '').trim();
    const normalizedReading = toNormalizedHiragana(clean);
    try {
      const res = await updateWordReading(data.word.id, normalizedReading);
      setData((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          word: {
            ...prev.word,
            pinyinDisplay: res.updatedReading,
            pinyinNumeric: res.updatedReading.toLowerCase(),
          },
          srsItem: prev.srsItem
            ? {
              ...prev.srsItem,
              displayReading: res.updatedReading,
            }
            : null,
        };
      });
      speakText(clean, lang, clean);
    } catch (e) {
      Alert.alert('Error', 'No se pudo actualizar la lectura.');
    }
  };

  // Para furigana, asegurar kana puro para evitar romper ruby sobre el kanji
  const furiganaReading = isJapanese
    ? (cleanReading.includes('•') || /\b(on|kun)\b/i.test(cleanReading)
      ? (kanjiMeta?.essentialReading || cleanReading.split(/[\/•]/)[0].replace(/^(on|kun)[:：\s]*/i, '').trim())
      : cleanReading)
    : cleanReading;

  // Categoría gramatical (explícita o heurística para japonés con saneamiento para palabras que terminan en kanji)
  let activeCategory = category;
  if (isJapanese) {
    if (parsedAux.dictionaryForm) {
      activeCategory = classifyJapaneseWord(parsedAux.dictionaryForm.kanji, parsedAux.dictionaryForm.reading || cleanReading);
    } else if (resolvedBase) {
      activeCategory = resolvedBase.category;
    } else if (isSingleKanji) {
      const resolved = resolveJapaneseBaseForm(cleanWord, cleanReading, rawKun);
      if (resolved) {
        activeCategory = resolved.category;
      } else {
        activeCategory = 'Sustantivo';
      }
    } else if (endsWithKanji && cleanWord.length > 1 && (activeCategory?.startsWith('Verbo') || activeCategory?.startsWith('Adjetivo -i'))) {
      activeCategory = classifyJapaneseWord(cleanWord, cleanReading);
    } else if (!activeCategory) {
      activeCategory = classifyJapaneseWord(cleanWord, cleanReading);
    }
  }

  // Formato amigable de estado FSRS
  const getSrsStateLabel = (stateNum?: number) => {
    switch (stateNum) {
      case State.New:
        return { label: 'Nueva', color: '#3B82F6' };
      case State.Learning:
        return { label: 'Aprendiendo', color: '#F59E0B' };
      case State.Review:
        return { label: 'En Repaso', color: '#10B981' };
      case State.Relearning:
        return { label: 'Reaprendiendo', color: '#EF4444' };
      default:
        return { label: 'Sin repasar', color: colors.textMuted };
    }
  };

  const srsStateInfo = getSrsStateLabel(srsItem?.state);
  const furiganaPairs = parseFurigana(word.simplified, furiganaReading);
  const kanjisList = extractKanjis(word.simplified);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 4 }]}>
      {/* Header superior dinámico Yomi alineado a la izquierda */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.brandHeaderContainer}>
          <Text style={[styles.brandText, { color: colors.primary }]}>Yomi</Text>
          <Text style={[styles.brandSep, { color: colors.textMuted }]}> • </Text>
          <Text style={[styles.deckName, { color: colors.text }]} numberOfLines={1}>
            {isCustomDeck ? 'Detalle de Tarjeta' : 'Detalle de Palabra'}
          </Text>
        </View>

        <TouchableOpacity onPress={handleDelete} style={styles.iconBtn}>
          <Ionicons name="trash-outline" size={22} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Tarjeta Principal de la Palabra */}
        <View style={[styles.mainCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>



          {/* Sección de la Palabra Principal con Furigana o Pregunta para Custom */}
          <View style={styles.wordSectionContainer}>
            {isCustomDeck ? (
              <View style={styles.customQuestionBox}>
                <Text style={[styles.customQuestionLabel, { color: colors.textMuted }]}>Pregunta (Frente):</Text>
                <Text style={[styles.customQuestionTitle, { color: colors.text }]}>
                  {word.simplified}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.rubyContainer}>
                  {furiganaPairs.map((pair, idx) => {
                    const textLen = word.simplified.length;
                    const fontSize = textLen > 12 ? 20 : textLen > 8 ? 24 : textLen > 5 ? 28 : 32;
                    return (
                      <View key={idx} style={styles.rubyPair}>
                        {pair.furigana ? (
                          <Text style={[styles.rubyRt, { color: colors.textMuted }]} numberOfLines={1}>
                            {pair.furigana}
                          </Text>
                        ) : (
                          <View style={{ height: 13 }} />
                        )}
                        <Text
                          style={[
                            isIdeographic ? styles.mainCharIdeographic : styles.mainCharAlphabetic,
                            { color: colors.text, fontSize }
                          ]}
                        >
                          {pair.char}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.readingRowContainer}>
                  {cleanReading && cleanReading !== word.simplified ? (
                    <Text style={[styles.readingTextBelow, { color: colors.primaryHover }]}>
                      {cleanReading}
                    </Text>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}

                  {!isCustomDeck && (
                    <TouchableOpacity
                      style={styles.smallAudioBtn}
                      activeOpacity={0.6}
                      onPress={handlePlayAudio}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel="Escuchar pronunciación"
                    >
                      {!isAudioReady ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Ionicons
                          name={isPlayingAudio ? 'volume-high' : 'volume-medium'}
                          size={18}
                          color={colors.primary}
                        />
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {/* Subtítulos ordenados: Nivel, Categoría, Forma Base */}
                {(activeLevel || activeCategory || (baseKanji && baseKanji !== word.simplified)) ? (
                  <View style={[styles.metaSubtitlesContainer, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
                    {activeLevel ? (
                      <View style={styles.metaSubtitleItemCompact}>
                        <Text style={[styles.metaSubtitleLabel, { color: colors.textMuted }]}>Nivel</Text>
                        <Text
                          style={[styles.metaSubtitleValue, { color: colors.primary }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit={true}
                        >
                          {activeLevel.startsWith('HSK') || activeLevel.startsWith('JLPT')
                            ? activeLevel
                            : lang.startsWith('ja')
                              ? `JLPT ${activeLevel}`
                              : `HSK ${activeLevel}`}
                        </Text>
                      </View>
                    ) : null}

                    {activeLevel && (activeCategory || (baseKanji && baseKanji !== word.simplified)) ? (
                      <View style={[styles.metaSubtitleDivider, { backgroundColor: colors.border }]} />
                    ) : null}

                    {activeCategory && !activeCategory.includes('Frase') ? (
                      <View style={styles.metaSubtitleItemFlexible}>
                        <Text style={[styles.metaSubtitleLabel, { color: colors.textMuted }]}>Categoría</Text>
                        <Text
                          style={[styles.metaSubtitleValue, { color: colors.text }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit={true}
                        >
                          {activeCategory}
                        </Text>
                      </View>
                    ) : null}

                    {(activeCategory && !activeCategory.includes('Frase')) && (baseKanji && baseKanji !== word.simplified) ? (
                      <View style={[styles.metaSubtitleDivider, { backgroundColor: colors.border }]} />
                    ) : null}

                    {baseKanji && baseKanji !== word.simplified ? (
                      <View style={styles.metaSubtitleItemCompact}>
                        <Text style={[styles.metaSubtitleLabel, { color: colors.textMuted }]}>Forma Base</Text>
                        <Text
                          style={[styles.metaSubtitleValue, { color: '#8B5CF6' }]}
                          numberOfLines={1}
                          adjustsFontSizeToFit={true}
                        >
                          {baseKanji}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Sección Lectura activa del Kanji: cada lectura On y Kun es un botón seleccionable para editar la lectura */}
                {isJapanese && hasKanjiReadings && (
                  <View style={[styles.kanjiReadingsSection, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
                    <View style={styles.kanjiReadingsHeader}>
                      <Text style={[styles.kanjiReadingsTitle, { color: colors.textMuted }]}>
                        Lectura activa del Kanji
                      </Text>
                      <TouchableOpacity
                        style={styles.manualEditBtn}
                        onPress={handleStartEditReading}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={[styles.manualEditBtnText, { color: colors.primary }]}>Editar manual</Text>
                      </TouchableOpacity>
                    </View>

                    {onReadingsList.length > 0 && (
                      <View style={styles.readingGroupRow}>
                        <Text style={[styles.readingGroupLabel, { color: colors.textMuted }]}>On:</Text>
                        <View style={styles.readingChipsWrapper}>
                          {onReadingsList.map((r, idx) => {
                            const clean = r.replace(/[・\-\~]/g, '').trim();
                            const hira = toNormalizedHiragana(clean);
                            const isCurrent = toNormalizedHiragana(cleanReading) === hira;
                            return (
                              <TouchableOpacity
                                key={`on-${idx}`}
                                style={[
                                  styles.readingChip,
                                  {
                                    backgroundColor: isCurrent ? colors.primary : colors.surface,
                                    borderColor: isCurrent ? colors.primary : colors.border,
                                  },
                                ]}
                                activeOpacity={0.7}
                                onPress={() => handleSelectQuickReading(r)}
                              >
                                <Text
                                  style={[
                                    styles.readingChipText,
                                    { color: isCurrent ? '#FFF' : colors.text, fontWeight: isCurrent ? '700' : '600' },
                                  ]}
                                >
                                  {r}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}

                    {kunReadingsList.length > 0 && (
                      <View style={[styles.readingGroupRow, { marginTop: onReadingsList.length > 0 ? 8 : 0 }]}>
                        <Text style={[styles.readingGroupLabel, { color: colors.textMuted }]}>Kun:</Text>
                        <View style={styles.readingChipsWrapper}>
                          {kunReadingsList.map((r, idx) => {
                            const clean = r.replace(/[・\-\~]/g, '').trim();
                            const hira = toNormalizedHiragana(clean);
                            const isCurrent = toNormalizedHiragana(cleanReading) === hira;
                            return (
                              <TouchableOpacity
                                key={`kun-${idx}`}
                                style={[
                                  styles.readingChip,
                                  {
                                    backgroundColor: isCurrent ? colors.primary : colors.surface,
                                    borderColor: isCurrent ? colors.primary : colors.border,
                                  },
                                ]}
                                activeOpacity={0.7}
                                onPress={() => handleSelectQuickReading(r)}
                              >
                                <Text
                                  style={[
                                    styles.readingChipText,
                                    { color: isCurrent ? '#FFF' : colors.text, fontWeight: isCurrent ? '700' : '600' },
                                  ]}
                                >
                                  {r}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </>
            )}
          </View>

          {/* Significados / Respuesta con selección personalizada para repaso SRS */}
          <View style={styles.sectionBox}>
            <View style={styles.meaningHeaderRow}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                {isCustomDeck ? 'Respuesta (Reverso):' : 'Significados para repasar:'}
              </Text>
              {!isCustomDeck && (
                <Text style={[styles.meaningHint, { color: colors.textMuted }]}>Toca para incluir/excluir</Text>
              )}
            </View>
            <View style={styles.meaningsContainer}>
              {displayMeaningsList.map((meaning, index) => {
                const isSelected = selectedMeanings.includes(meaning);
                const allMeaningsCount = displayMeaningsList.length;
                return (
                  <View
                    key={index}
                    style={[
                      styles.meaningSelectableItem,
                      {
                        backgroundColor: isSelected ? colors.surfaceHighlight : 'transparent',
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.meaningTouchRow}
                      activeOpacity={0.7}
                      onPress={() => (isCustomDeck ? handleStartEditMeaning(meaning) : handleToggleMeaning(meaning))}
                    >
                      <View
                        style={[
                          styles.meaningCheckbox,
                          {
                            borderColor: isSelected ? colors.primary : colors.textMuted,
                            backgroundColor: isSelected ? colors.primary : 'transparent',
                          },
                        ]}
                      >
                        {isSelected ? <Ionicons name="checkmark" size={13} color="#FFF" /> : null}
                      </View>
                      <Text
                        style={[
                          styles.meaningText,
                          {
                            color: isSelected ? colors.text : colors.textMuted,
                            fontWeight: isSelected ? '600' : 'normal',
                            textDecorationLine: !isCustomDeck && !isSelected ? 'line-through' : 'none',
                            opacity: isSelected ? 1 : 0.6,
                          },
                          isCustomDeck && styles.customMeaningText,
                        ]}
                      >
                        {meaning}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.meaningActionsContainer}>
                      <TouchableOpacity
                        style={styles.meaningActionBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => handleStartEditMeaning(meaning)}
                      >
                        <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                      </TouchableOpacity>

                      {allMeaningsCount > 1 && (
                        <TouchableOpacity
                          style={styles.meaningActionBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={() => handleDeleteSingleMeaning(meaning)}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Sección condicional: Trazado para idiomas ideográficos (Chino/Japonés) */}
        {isIdeographic && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginLeft: 0 }]}>Trazado y Caracteres</Text>
            </View>

            <View style={[styles.strokeBox, { backgroundColor: colors.surfaceHighlight }]}>
              <Text
                style={[styles.strokeCharPreview, { color: colors.primary }]}
                numberOfLines={1}
                adjustsFontSizeToFit={true}
              >
                {word.simplified}
              </Text>
              <Text style={[styles.strokeTip, { color: colors.textMuted }]}>
                Total de caracteres: {word.simplified.length} {word.traditional && word.traditional !== word.simplified ? `| Tradicional: ${word.traditional}` : ''}
              </Text>
            </View>

            {/* Desglose individual de cada Kanji con su propia Badge de Nivel JLPT */}
            {kanjisList.length > 0 && (
              <View style={styles.kanjiBreakdownContainer}>
                <Text style={[styles.kanjiBreakdownLabel, { color: colors.textMuted }]}>
                  {isChinese ? `Desglose de Hanzi (${kanjisList.length}):` : `Desglose de Kanjis (${kanjisList.length}):`}
                </Text>
                {kanjisList.map((char) => {
                  const charLevel = isChinese
                    ? (getQuickHskLevel(char) ? `HSK ${getQuickHskLevel(char)}` : null)
                    : (getKanjiJlptLevel(char) ? `JLPT ${getKanjiJlptLevel(char)}` : null);
                  const formattedCharLevel = charLevel;

                  const pairMatch = furiganaPairs.find((p) => p.char === char);
                  const charFurigana = pairMatch?.furigana;

                  return (
                    <TouchableOpacity
                      key={char}
                      style={[styles.kanjiCard, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
                      activeOpacity={0.7}
                      onPress={() => setSelectedKanji(char)}
                    >
                      <View style={styles.kanjiCardLeft}>
                        <View style={styles.kanjiCharWithFurigana}>
                          {charFurigana ? (
                            <Text style={[styles.kanjiBreakdownFurigana, { color: colors.textMuted }]}>
                              {charFurigana}
                            </Text>
                          ) : (
                            <View style={{ height: 11 }} />
                          )}
                          <Text style={[styles.kanjiCardChar, { color: colors.text }]}>{char}</Text>
                        </View>

                        <View style={styles.kanjiCardMeta}>
                          {formattedCharLevel ? (
                            <View style={styles.kanjiBadge}>
                              <Text style={[styles.kanjiBadgeText, { color: colors.primary }]}>
                                {formattedCharLevel}
                              </Text>
                            </View>
                          ) : (
                            <Text style={[styles.kanjiNoLevel, { color: colors.textMuted }]}>Sin nivel específico</Text>
                          )}
                        </View>
                      </View>

                      <View style={[styles.kanjiActionBtn, { backgroundColor: colors.primary }]}>
                        <Ionicons name="play" size={14} color="#FFF" style={{ marginRight: 4 }} />
                        <Text style={styles.kanjiActionBtnText}>Ver trazado</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Sección de Palabras Compuestas / Ejemplos Comunes con contenedor y spinner de carga */}
        {isIdeographic && (compoundsLoading || asyncCompounds.length > 0) && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="library-outline" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Palabras comunes con este carácter</Text>
            </View>
            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
              {compoundsLoading ? 'Consultando diccionario...' : 'Ejemplos de uso frecuente en el diccionario:'}
            </Text>

            {compoundsLoading ? (
              <View style={styles.compoundsLoadingBox}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.compoundsLoadingText, { color: colors.textMuted }]}>
                  Buscando palabras comunes en el diccionario...
                </Text>
              </View>
            ) : (
              asyncCompounds.map((comp) => (
                <View key={comp.id} style={[styles.compoundItem, { backgroundColor: colors.surfaceHighlight }]}>
                  <View style={styles.compoundTopRow}>
                    <Text style={[styles.compoundChar, { color: colors.text }]}>{comp.simplified}</Text>
                    <Text style={[styles.compoundPinyin, { color: colors.primaryHover }]}>{comp.pinyinDisplay}</Text>
                  </View>
                  <Text style={[styles.compoundMeaning, { color: colors.textMuted }]} numberOfLines={2}>
                    {cleanAndFormatMeanings(comp.meanings).slice(0, 2).join(', ')}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {/* Ficha SRS FSRS */}
        {srsItem && (
          <View style={[styles.srsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="analytics-outline" size={20} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Estado de Aprendizaje</Text>
            </View>

            <View style={styles.srsGrid}>
              <View style={[styles.srsStat, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.srsStatLabel, { color: colors.textMuted }]}>Estado</Text>
                <View style={[styles.srsBadge, { backgroundColor: srsStateInfo.color + '22' }]}>
                  <Text style={[styles.srsBadgeText, { color: srsStateInfo.color }]}>
                    {srsStateInfo.label}
                  </Text>
                </View>
              </View>

              <View style={[styles.srsStat, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.srsStatLabel, { color: colors.textMuted }]}>Repasos</Text>
                <Text style={[styles.srsStatValue, { color: colors.text }]}>{srsItem.reps} veces</Text>
              </View>

              <View style={[styles.srsStat, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.srsStatLabel, { color: colors.textMuted }]}>Dificultad</Text>
                <Text style={[styles.srsStatValue, { color: colors.text }]}>{srsItem.difficulty?.toFixed(1) || '0.0'}</Text>
              </View>

              <View style={[styles.srsStat, { backgroundColor: colors.surfaceHighlight }]}>
                <Text style={[styles.srsStatLabel, { color: colors.textMuted }]}>Próximo repaso</Text>
                <Text style={[styles.srsStatValue, { color: colors.text }]}>
                  {formatNextReviewTime(srsItem.due)}
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Modal de Animación de Trazado de Kanji Paso a Paso */}
      <Modal
        visible={!!selectedKanji}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedKanji(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {isChinese ? `Hanzi ${selectedKanji}` : `Kanji ${selectedKanji}`}
                </Text>
                {selectedKanji && (isChinese ? getQuickHskLevel(selectedKanji) : getKanjiJlptLevel(selectedKanji)) ? (
                  <View style={styles.levelBadge}>
                    <Text style={[styles.levelBadgeText, { color: colors.primary }]}>
                      {isChinese ? `HSK ${getQuickHskLevel(selectedKanji)}` : `JLPT ${getKanjiJlptLevel(selectedKanji)}`}
                    </Text>
                  </View>
                ) : null}
              </View>

              <TouchableOpacity onPress={() => setSelectedKanji(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {selectedKanji ? (
                <KanjiStrokeViewer
                  char={selectedKanji}
                  primaryColor={colors.primary}
                  textMutedColor={colors.textMuted}
                  isChinese={isChinese}
                />
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.modalCloseFullBtn, { backgroundColor: colors.primary }]}
              onPress={() => setSelectedKanji(null)}
            >
              <Text style={styles.modalCloseFullBtnText}>Cerrar Ventana</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal interactivo para editar significado */}
      <Modal
        visible={Boolean(editingMeaning)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingMeaning(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.editModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.editModalHeader}>
              <Text style={[styles.editModalTitle, { color: colors.text }]}>
                {isCustomDeck ? 'Editar Respuesta' : 'Editar Significado'}
              </Text>
              <TouchableOpacity onPress={() => setEditingMeaning(null)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[
                styles.editMeaningInput,
                {
                  backgroundColor: colors.surfaceHighlight,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              value={editMeaningText}
              onChangeText={setEditMeaningText}
              placeholder={isCustomDeck ? 'Ingresa la respuesta...' : 'Ingresa el significado...'}
              placeholderTextColor={colors.textMuted}
              multiline
              autoFocus
            />

            <View style={styles.editModalActionsRow}>
              <TouchableOpacity
                style={[styles.editModalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setEditingMeaning(null)}
              >
                <Text style={[styles.editModalCancelText, { color: colors.textMuted }]}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.editModalSaveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveEditedMeaning}
              >
                <Text style={styles.editModalSaveText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal para Editar Lectura */}
      <Modal
        visible={isEditingReading && isJapanese}
        transparent
        animationType="fade"
        onRequestClose={() => setIsEditingReading(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.editModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.editModalHeader}>
              <Text style={[styles.editModalTitle, { color: colors.text }]}>Editar Lectura</Text>
              <TouchableOpacity onPress={() => setIsEditingReading(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.editModalSubtitle, { color: colors.textMuted }]}>
              Modifica la pronunciación para audio, furigana y repaso.
            </Text>

            {(onReadingCandidate || kunReadingCandidate) && (
              <View style={styles.quickReadingsRow}>
                {kunReadingCandidate ? (
                  <TouchableOpacity
                    style={[styles.quickReadingChip, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
                    onPress={() => {
                      const cleanK = kunReadingCandidate.split(/[,、\/\s]/)[0].replace(/[・\-\~]/g, '').trim();
                      setEditReadingText(cleanK);
                    }}
                  >
                    <Text style={[styles.quickReadingChipLabel, { color: colors.primary }]}>
                      Kun: {kunReadingCandidate.split(/[,、\/\s]/)[0].replace(/[・\-\~]/g, '')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {onReadingCandidate ? (
                  <TouchableOpacity
                    style={[styles.quickReadingChip, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}
                    onPress={() => {
                      const cleanO = onReadingCandidate.split(/[,、\/\s]/)[0].replace(/[・\-\~]/g, '').trim();
                      setEditReadingText(cleanO);
                    }}
                  >
                    <Text style={[styles.quickReadingChipLabel, { color: colors.primary }]}>
                      On: {onReadingCandidate.split(/[,、\/\s]/)[0].replace(/[・\-\~]/g, '')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            <TextInput
              style={[
                styles.editMeaningInput,
                {
                  backgroundColor: colors.surfaceHighlight,
                  color: colors.text,
                  borderColor: colors.border,
                  minHeight: 48,
                },
              ]}
              value={editReadingText}
              onChangeText={setEditReadingText}
              placeholder="Ej: やま, なに, ni3 hao3"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />

            <View style={styles.editModalActionsRow}>
              <TouchableOpacity
                style={[styles.editModalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setIsEditingReading(false)}
              >
                <Text style={[styles.editModalCancelText, { color: colors.textMuted }]}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.editModalSaveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveEditedReading}
              >
                <Text style={styles.editModalSaveText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
  },
  brandHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: Spacing.xs,
  },
  brandText: {
    fontSize: 20,
    fontWeight: '800',
  },
  brandSep: {
    fontSize: 18,
  },
  iconBtn: {
    padding: Spacing.xs,
  },
  deckName: {
    fontSize: 17,
    fontWeight: '600',
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 60,
  },
  mainCard: {
    borderRadius: 20,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    ...Shadows.card,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  wordSectionContainer: {
    marginBottom: Spacing.md,
  },
  rubyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  rubyPair: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  rubyRt: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 13,
    marginBottom: -5,
    minHeight: 13,
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  readingRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 4,
    minHeight: 28,
  },
  readingTextBelow: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  smallAudioBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  categoryBadge: {
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
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
    borderRadius: 6,
  },
  levelBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  mainCharIdeographic: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  mainCharAlphabetic: {
    fontSize: 30,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  customQuestionBox: {
    paddingVertical: Spacing.xs,
  },
  customQuestionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  customQuestionTitle: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  customMeaningText: {
    fontSize: 15,
    lineHeight: 22,
  },
  audioBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  sectionBox: {
    marginTop: Spacing.xs,
  },
  sectionLabel: {
    ...Typography.bodySmall,
    marginBottom: 0,
  },
  meaningHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  meaningHint: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  meaningsContainer: {
    marginTop: 2,
  },
  meaningSelectableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  meaningTouchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  meaningActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 6,
  },
  meaningActionBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meaningDeleteBtn: {
    padding: 6,
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModalCard: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 16,
    padding: Spacing.md + 4,
    borderWidth: 1,
    ...Shadows.card,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  editModalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  editMeaningInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: Spacing.sm + 4,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
  },
  editModalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
  },
  editModalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalCancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  editModalSaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalSaveText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  meaningCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  meaningItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  meaningBullet: {
    fontSize: 16,
    marginRight: 8,
  },
  meaningText: {
    ...Typography.bodySmall,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  sectionCard: {
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    ...Shadows.card,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    ...Typography.body,
    fontWeight: '700',
    marginLeft: Spacing.xs,
  },
  sectionSub: {
    ...Typography.bodySmall,
    marginBottom: Spacing.sm,
  },
  strokeBox: {
    borderRadius: 12,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xs,
    width: '100%',
  },
  strokeCharPreview: {
    fontSize: 44,
    fontWeight: '300',
    marginVertical: Spacing.xs,
    textAlign: 'center',
    width: '100%',
  },
  strokeTip: {
    ...Typography.bodySmall,
    fontSize: 12,
  },
  kanjiBreakdownContainer: {
    marginTop: Spacing.md,
  },
  kanjiBreakdownLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  kanjiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  kanjiCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kanjiCardChar: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  kanjiCardMeta: {
    justifyContent: 'center',
  },
  kanjiCharWithFurigana: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  kanjiBreakdownFurigana: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: -4,
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  kanjiBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  kanjiBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  kanjiNoLevel: {
    fontSize: 11,
  },
  kanjiActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  kanjiActionBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  compoundItem: {
    borderRadius: 12,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  compoundTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  compoundChar: {
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: Spacing.sm,
  },
  compoundPinyin: {
    fontSize: 13,
    fontWeight: '500',
  },
  compoundMeaning: {
    ...Typography.bodySmall,
    fontSize: 12,
  },
  compoundsLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  compoundsLoadingText: {
    ...Typography.bodySmall,
    fontSize: 13,
  },
  srsCard: {
    borderRadius: 16,
    padding: Spacing.md,
    borderWidth: 1,
    ...Shadows.card,
  },
  srsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  srsStat: {
    width: '48%',
    padding: Spacing.sm,
    borderRadius: 10,
    marginBottom: Spacing.xs,
  },
  srsStatLabel: {
    fontSize: 11,
    marginBottom: 4,
  },
  srsStatValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  srsBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  srsBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  errorText: {
    ...Typography.body,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  backButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 10,
  },
  backButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    ...Shadows.card,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: Spacing.xs,
  },
  modalCloseBtn: {
    padding: Spacing.xs,
  },
  modalBody: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalCloseFullBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseFullBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  metaSubtitlesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
    marginHorizontal: -12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  metaSubtitleItemCompact: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    minWidth: 55,
  },
  metaSubtitleItemFlexible: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 6,
  },
  metaSubtitleDivider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
  },
  metaSubtitleLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
    textAlign: 'center',
  },
  metaSubtitleValue: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  kanjiReadingsSection: {
    marginTop: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'stretch',
  },
  kanjiReadingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kanjiReadingsTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  manualEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  manualEditBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  readingGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  readingGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
    minWidth: 32,
  },
  readingChipsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  readingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  readingChipText: {
    fontSize: 13,
  },
  editModalSubtitle: {
    fontSize: 13,
    marginBottom: Spacing.sm,
  },
  quickReadingsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.sm,
    flexWrap: 'wrap',
  },
  quickReadingChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickReadingChipLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
});
