import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { speakText } from '../../lib/audio-service';
import { ALL_LANGUAGES, DeckWithStats, getDecksWithStats } from '../../lib/deck-service';
import { getQuickHskLevel } from '../../lib/hsk-data';
import { JapaneseEntry, searchJapanese } from '../../lib/japanese-search';
import { classifyJapaneseWord, isJapaneseDictionaryForm } from '../../lib/japanese-utils';
import { DictionaryEntry, getChineseSpanishMeaning, searchByPinyin, SearchResult } from '../../lib/search-engine';
import { saveCustomWord, saveGenericWord, saveWords } from '../../lib/word-service';
import { useTheme } from '../../providers/ThemeProvider';
import { Shadows, Spacing, Typography } from '../constants/theme';

export default function SearchScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ deckId?: string }>();
  const router = useRouter();

  const [decks, setDecks] = useState<DeckWithStats[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>(params.deckId || '');
  const [currentDeck, setCurrentDeck] = useState<DeckWithStats | null>(null);

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Referencias para debounce y cancelación de carreras asíncronas
  const latestQueryRef = useRef('');
  const debounceTimerRef = useRef<any>(null);

  // Estados Chino
  const [chineseResults, setChineseResults] = useState<SearchResult | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<{ [syllableIndex: number]: DictionaryEntry }>({});
  const [chineseCustomMeaning, setChineseCustomMeaning] = useState('');
  const [isTranslatingChineseMeaning, setIsTranslatingChineseMeaning] = useState(false);
  const latestBuiltHanziRef = useRef('');

  // Estados Japonés
  const [japaneseResults, setJapaneseResults] = useState<JapaneseEntry[]>([]);

  // Estados Otros Idiomas (Inglés, Español, etc.)
  const [genericTranslation, setGenericTranslation] = useState('');
  const [isGenericTranslating, setIsGenericTranslating] = useState(false);

  // Cargar mazos
  useEffect(() => {
    const loadDecks = async () => {
      const allDecks = await getDecksWithStats();
      setDecks(allDecks);
      if (allDecks.length > 0) {
        const targetId = params.deckId || allDecks[0].id;
        setSelectedDeckId(targetId);
        const active = allDecks.find(d => d.id === targetId) || allDecks[0];
        setCurrentDeck(active);
      }
    };
    loadDecks();
  }, [params.deckId]);

  const handleSelectDeck = (deck: DeckWithStats) => {
    setSelectedDeckId(deck.id);
    setCurrentDeck(deck);
    setQuery('');
    latestQueryRef.current = '';
    latestBuiltHanziRef.current = '';
    setChineseResults(null);
    setJapaneseResults([]);
    setGenericTranslation('');
    setSelectedEntries({});
    setChineseCustomMeaning('');
  };

  const langCode = currentDeck?.languageCode || 'zh-CN';
  const isChinese = langCode.startsWith('zh');
  const isJapanese = langCode.startsWith('ja');

  const currentLangMeta = ALL_LANGUAGES.find(l => l.code === langCode) || {
    label: 'Idioma',
    flag: '🌐',
    placeholder: 'Escribí una palabra...',
  };

  // --- EJECUCIÓN REAL DE LA BÚSQUEDA ASÍNCRONA ---
  const performSearch = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setChineseResults(null);
      setJapaneseResults([]);
      setGenericTranslation('');
      setChineseCustomMeaning('');
      latestBuiltHanziRef.current = '';
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    if (isChinese) {
      // 1. Chino: Pinyin + Segmentador
      const res = await searchByPinyin(trimmed);
      if (latestQueryRef.current === text) {
        setChineseResults(res);
        if (res.syllableGroups.length > 0 && res.exactMatches.length === 0) {
          const initialSelection: { [key: number]: DictionaryEntry } = {};
          res.syllableGroups.forEach((group, index) => {
            if (group.candidates.length > 0) {
              initialSelection[index] = group.candidates[0];
            }
          });
          setSelectedEntries(initialSelection);
        }
        setIsSearching(false);
      }
    } else if (isJapanese) {
      // 2. Japonés: Romaji / Kana / Kanji -> Diccionario estructurado con JLPT
      const jaEntries = await searchJapanese(trimmed);
      if (latestQueryRef.current === text) {
        setJapaneseResults(jaEntries);
        setIsSearching(false);
      }
    } else {
      // 3. Otros idiomas: Auto-traducción
      setIsGenericTranslating(true);
      try {
        const sourceLang = langCode.split('-')[0];
        const response = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=es&dt=t&q=${encodeURIComponent(trimmed)}`
        );
        const data = await response.json();
        if (latestQueryRef.current === text && data && data[0] && data[0][0] && data[0][0][0]) {
          setGenericTranslation(data[0][0][0].trim());
        }
      } catch (e) { }
      if (latestQueryRef.current === text) {
        setIsGenericTranslating(false);
        setIsSearching(false);
      }
    }
  };

  // --- INPUT CON DEBOUNCE ANTI-CARRERA ---
  const handleQueryChange = (text: string) => {
    setQuery(text);
    latestQueryRef.current = text;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!text.trim()) {
      setChineseResults(null);
      setJapaneseResults([]);
      setGenericTranslation('');
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceTimerRef.current = setTimeout(() => {
      performSearch(text);
    }, 280);
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // --- GUARDADO RÁPIDO CHINO CON HSK ---
  const handleQuickSaveChinese = async (entry: DictionaryEntry) => {
    if (!selectedDeckId) return;
    try {
      const hskNum = getQuickHskLevel(entry.simplified);
      await saveWords(selectedDeckId, [entry], hskNum ? `HSK ${hskNum}` : undefined);
      Alert.alert('¡Guardado!', `"${entry.simplified}" fue agregada a "${currentDeck?.name}".`);
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la palabra.');
    }
  };

  // --- GUARDADO RÁPIDO JAPONÉS CON JLPT Y CONJUGACIÓN ---
  const handleQuickSaveJapanese = async (entry: JapaneseEntry) => {
    if (!selectedDeckId) return;

    const isConjugable =
      Boolean(entry.dictionaryForm) ||
      Boolean(entry.category && (entry.category.startsWith('Verbo') || entry.category.startsWith('Adjetivo')));

    const itemTypeLabel = entry.category?.startsWith('Verbo')
      ? 'el verbo'
      : entry.category?.startsWith('Adjetivo')
        ? 'el adjetivo'
        : 'la palabra';

    const executeSave = async (withConjugation: boolean) => {
      try {
        if (withConjugation && entry.dictionaryForm && entry.kanji !== entry.dictionaryForm.kanji) {
          // 1. Guardar la tarjeta con la forma exacta que eligió el usuario (ej. 飲みます) sin habilitar conjugación
          await saveGenericWord(selectedDeckId, {
            text: entry.kanji,
            reading: entry.reading,
            meanings: JSON.stringify(entry.meanings),
            level: entry.level,
            category: entry.category,
            conjugationEnabled: false,
          });

          // 2. Guardar también la forma diccionario para la práctica de conjugación (ej. 飲む)
          await saveGenericWord(selectedDeckId, {
            text: entry.dictionaryForm.kanji,
            reading: entry.dictionaryForm.reading,
            meanings: JSON.stringify(entry.dictionaryForm.meanings || entry.meanings),
            level: entry.level,
            category: entry.category,
            conjugationEnabled: true,
          });

          const levelLabel = entry.level ? ` [JLPT ${entry.level}]` : '';
          Alert.alert(
            '¡Guardado doble!',
            `Se agregaron "${entry.kanji}" (${entry.reading}) y la forma diccionario "${entry.dictionaryForm.kanji}" (${entry.dictionaryForm.reading})${levelLabel} a "${currentDeck?.name}".`
          );
        } else {
          // Solo habilitar conjugación si es una forma base/diccionario
          const isBase = isJapaneseDictionaryForm(entry.kanji, entry.reading, entry.category || '');
          await saveGenericWord(selectedDeckId, {
            text: entry.kanji,
            reading: entry.reading,
            meanings: JSON.stringify(entry.meanings),
            level: entry.level,
            category: entry.category,
            conjugationEnabled: withConjugation && isBase,
          });
          const levelLabel = entry.level ? ` [JLPT ${entry.level}]` : '';
          Alert.alert(
            '¡Guardado!',
            `"${entry.kanji}" (${entry.reading})${levelLabel} fue agregada a "${currentDeck?.name}".`
          );
        }
      } catch (e) {
        Alert.alert('Error', 'No se pudo guardar la palabra.');
      }
    };

    if (isConjugable) {
      Alert.alert(
        `¿Quieres agregar ${itemTypeLabel} al ejercicio de conjugación?`,
        'Al presionar Sí, se guardará la tarjeta que elegiste y también la forma diccionario para la práctica.',
        [
          {
            text: 'No',
            style: 'cancel',
            onPress: () => executeSave(false),
          },
          {
            text: 'Sí',
            onPress: () => executeSave(true),
          },
        ]
      );
    } else {
      executeSave(false);
    }
  };

  // --- GUARDADO OTROS IDIOMAS ---
  const handleSaveGeneric = async () => {
    if (!selectedDeckId || !query.trim()) return;
    try {
      await saveGenericWord(selectedDeckId, {
        text: query.trim(),
        meanings: genericTranslation.trim() || query.trim(),
      });
      Alert.alert('¡Guardado!', `"${query.trim()}" fue agregada a "${currentDeck?.name}".`, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la palabra.');
    }
  };

  const handleSpeak = (text: string) => {
    speakText(text, langCode);
  };

  // Hanzi / Pinyin construidos para Chino
  const builtHanzi = chineseResults?.syllableGroups
    ? chineseResults.syllableGroups.map((_, idx) => selectedEntries[idx]?.simplified || '').join('')
    : '';
  const builtPinyin = chineseResults?.syllableGroups
    ? chineseResults.syllableGroups.map((_, idx) => selectedEntries[idx]?.pinyinDisplay || '').join(' ')
    : query;

  // Efecto reactivo: calcula y obtiene automáticamente el significado en español para los caracteres Hanzi seleccionados
  useEffect(() => {
    if (!isChinese || !builtHanzi || !chineseResults?.syllableGroups || chineseResults.exactMatches.length > 0) {
      return;
    }

    latestBuiltHanziRef.current = builtHanzi;
    setIsTranslatingChineseMeaning(true);

    const currentCandidates = chineseResults.syllableGroups
      .map((_, idx) => selectedEntries[idx])
      .filter((entry): entry is DictionaryEntry => Boolean(entry));

    getChineseSpanishMeaning(builtHanzi, currentCandidates)
      .then((meaning) => {
        if (latestBuiltHanziRef.current === builtHanzi) {
          setChineseCustomMeaning(meaning);
          setIsTranslatingChineseMeaning(false);
        }
      })
      .catch(() => {
        if (latestBuiltHanziRef.current === builtHanzi) {
          setIsTranslatingChineseMeaning(false);
        }
      });
  }, [isChinese, builtHanzi, chineseResults?.exactMatches.length]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 4 }]}>
      {/* Header superior dinámico Yomi */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.brandTitleContainer}>
          <Text style={[styles.brandText, { color: colors.primary }]}>Yomi</Text>
          <Text style={[styles.brandSep, { color: colors.textMuted }]}> • </Text>
          <Text style={[styles.topTitle, { color: colors.text }]}>Buscar Palabra</Text>
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: Spacing.md }}>
        {/* Selector de Mazo */}
        <View style={styles.deckPickerSection}>
          <Text style={[styles.deckPickerLabel, { color: colors.textMuted }]}>Mazo de destino:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deckChipsScroll}>
            {decks.map((d) => {
              const isSelected = d.id === selectedDeckId;
              const langMeta = ALL_LANGUAGES.find(l => l.code === d.languageCode);
              return (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.deckChip,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }
                  ]}
                  onPress={() => handleSelectDeck(d)}
                >
                  <Text style={styles.deckChipFlag}>{langMeta?.flag || '📚'}</Text>
                  <Text style={[styles.deckChipText, { color: colors.text }, isSelected && { color: '#FFF' }]}>
                    {d.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Input Único de Reconocimiento */}
        <View style={[styles.inputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={20} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder={currentLangMeta.placeholder}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={handleQueryChange}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={true}
          />
          {isSearching && <ActivityIndicator color={colors.primary} style={styles.loader} />}
        </View>

        {/* CASO 1: IDIOMA JAPONÉS */}
        {isJapanese && (
          <FlatList
            data={japaneseResults}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: Spacing.xl }}
            ListEmptyComponent={
              query.trim().length > 0 && !isSearching ? (
                <View style={styles.emptySearchBox}>
                  <Text style={[styles.emptySearchText, { color: colors.textMuted }]}>
                    No se encontraron coincidencias para "{query}".
                  </Text>
                  <TouchableOpacity
                    style={[styles.manualAddBtn, { backgroundColor: colors.primary }]}
                    onPress={() =>
                      handleQuickSaveJapanese({
                        id: 'custom',
                        kanji: query.trim(),
                        reading: query.trim(),
                        romaji: query.trim(),
                        meanings: [query.trim()],
                        isCommon: false,
                        category: classifyJapaneseWord(query.trim(), query.trim()),
                      })
                    }
                  >
                    <Ionicons name="add-circle" size={18} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.manualAddBtnText}>Guardar "{query}" como tarjeta</Text>
                  </TouchableOpacity>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {/* Badges superiores (JLPT y Categoría) */}
                {(item.level || (item.category && !item.category.includes('Frase'))) && (
                  <View style={styles.cardBadgesRow}>
                    {item.category && !item.category.includes('Frase') && (
                      <View style={[styles.categoryBadge, { backgroundColor: colors.surfaceHighlight }]}>
                        <Text style={[styles.categoryBadgeText, { color: colors.primary }]}>{item.category}</Text>
                      </View>
                    )}
                    {item.level && (
                      <View style={styles.levelBadge}>
                        <Text style={[styles.levelBadgeText, { color: colors.primary }]}>JLPT {item.level}</Text>
                      </View>
                    )}

                  </View>
                )}

                {/* Fila principal: Palabra + Lectura a la izquierda, Botón + a la derecha */}
                <View style={styles.wordMainRow}>
                  <View style={styles.wordTextGroup}>
                    <Text style={[styles.japaneseKanji, { color: colors.text }]}>{item.kanji}</Text>
                    {item.reading !== item.kanji && (
                      <View style={[styles.readingBadge, { backgroundColor: colors.surfaceHighlight }]}>
                        <Text style={[styles.readingBadgeText, { color: colors.primaryHover }]}>{item.reading}</Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleQuickSaveJapanese(item)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="add" size={22} color="#FFF" />
                  </TouchableOpacity>
                </View>

                {/* Significados legibles */}
                <Text style={[styles.meanings, { color: colors.text }]}>{item.meanings.join(', ')}</Text>
              </View>
            )}
          />
        )}

        {/* CASO 2: IDIOMA CHINO */}
        {isChinese && chineseResults && (
          <>
            {chineseResults.exactMatches.length > 0 ? (
              <FlatList
                data={chineseResults.exactMatches}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: Spacing.xl }}
                renderItem={({ item }) => {
                  let meaningsList: string[] = [];
                  try {
                    meaningsList = JSON.parse(item.meanings);
                  } catch {
                    meaningsList = [item.meanings];
                  }

                  const hskNum = getQuickHskLevel(item.simplified);

                  return (
                    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      {/* Badge HSK superior */}
                      {hskNum && (
                        <View style={styles.cardBadgesRow}>
                          <View style={styles.levelBadge}>
                            <Text style={[styles.levelBadgeText, { color: colors.primary }]}>HSK {hskNum}</Text>
                          </View>
                        </View>
                      )}

                      {/* Fila principal: Carácter + Pinyin a la izquierda, Botón + a la derecha */}
                      <View style={styles.wordMainRow}>
                        <View style={styles.wordTextGroup}>
                          <Text style={[styles.char, { color: colors.text }]}>{item.simplified}</Text>

                          <View style={[styles.pinyinContainer, { backgroundColor: colors.surfaceHighlight }]}>
                            <Text style={[styles.pinyin, { color: colors.primaryHover }]}>{item.pinyinDisplay}</Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                          onPress={() => handleQuickSaveChinese(item)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="add" size={22} color="#FFF" />
                        </TouchableOpacity>
                      </View>

                      <Text style={[styles.meanings, { color: colors.text }]}>{meaningsList.join(', ')}</Text>
                    </View>
                  );
                }}
              />
            ) : (
              /* Constructor por sílabas si no hubo exacta */
              <ScrollView style={styles.builderContainer} contentContainerStyle={{ paddingBottom: 60 }}>
                <View style={[styles.builderHeaderBox, { backgroundColor: colors.surfaceHighlight }]}>
                  <Ionicons name="sparkles" size={20} color={colors.primary} />
                  <Text style={[styles.builderHeaderText, { color: colors.text }]}>
                    Palabra armada por sílabas. Seleccioná los caracteres deseados:
                  </Text>
                </View>

                <View style={[styles.previewBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Resultado:</Text>
                  <Text style={[styles.previewHanzi, { color: colors.primary }]}>{builtHanzi}</Text>
                  <Text style={[styles.previewPinyin, { color: colors.primaryHover }]}>{builtPinyin}</Text>
                </View>

                {chineseResults.syllableGroups.map((group, syllableIdx) => (
                  <View key={syllableIdx} style={styles.syllableRow}>
                    <Text style={[styles.syllableLabel, { color: colors.textMuted }]}>
                      Sílaba #{syllableIdx + 1}: <Text style={[styles.syllableTag, { color: colors.primary }]}>{group.syllable}</Text>
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.candidatesScroll}>
                      {group.candidates.map((cand) => {
                        const isSelected = selectedEntries[syllableIdx]?.id === cand.id;
                        return (
                          <TouchableOpacity
                            key={cand.id}
                            style={[
                              styles.chip,
                              { backgroundColor: colors.surface, borderColor: colors.border },
                              isSelected && { backgroundColor: colors.primary, borderColor: colors.primary }
                            ]}
                            onPress={() => setSelectedEntries(prev => ({ ...prev, [syllableIdx]: cand }))}
                          >
                            <Text style={[styles.chipText, { color: colors.text }, isSelected && { color: '#FFF' }]}>
                              {cand.simplified}
                            </Text>
                            <Text style={[styles.chipPinyin, { color: colors.textMuted }, isSelected && { color: '#FFF' }]}>
                              {cand.pinyinDisplay}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ))}

                <View style={[styles.builderMeaningContainer, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.builderMeaningInput, { color: colors.text }]}
                    placeholder={isTranslatingChineseMeaning ? "Obteniendo significado en español..." : "Significado en español..."}
                    placeholderTextColor={colors.textMuted}
                    value={chineseCustomMeaning}
                    onChangeText={setChineseCustomMeaning}
                  />
                  {isTranslatingChineseMeaning && (
                    <ActivityIndicator size="small" color={colors.primary} style={styles.builderLoader} />
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.createBtn, { backgroundColor: colors.primary }]}
                  onPress={async () => {
                    if (!selectedDeckId || !builtHanzi) return;
                    const hskNum = getQuickHskLevel(builtHanzi);
                    await saveCustomWord(selectedDeckId, {
                      simplified: builtHanzi,
                      pinyinDisplay: builtPinyin,
                      meanings: chineseCustomMeaning || 'Sin significado',
                      level: hskNum ? `HSK ${hskNum}` : undefined,
                    });
                    Alert.alert('¡Palabra Creada!', `"${builtHanzi}" guardada en tu mazo.`, [
                      { text: 'OK', onPress: () => router.back() }
                    ]);
                  }}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.createBtnText}>Guardar en {currentDeck?.name}</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </>
        )}

        {/* CASO 3: OTROS IDIOMAS */}
        {!isChinese && !isJapanese && query.trim().length > 0 && (
          <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View style={styles.wordMainRow}>
                  <Text style={[styles.alphabeticWord, { color: colors.text }]}>{query.trim()}</Text>
                </View>
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity style={[styles.audioIconBtn, { backgroundColor: colors.surfaceHighlight, borderColor: colors.border }]} onPress={() => handleSpeak(query.trim())}>
                    <Ionicons name="volume-high" size={20} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSaveGeneric}>
                    <Ionicons name="add" size={24} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.translationRow}>
                <Text style={[styles.translationLabel, { color: colors.textMuted }]}>Traducción / Significado:</Text>
                {isGenericTranslating ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <TextInput
                    style={[styles.editableMeaningInput, { backgroundColor: colors.surfaceHighlight, color: colors.text }]}
                    value={genericTranslation}
                    onChangeText={setGenericTranslation}
                    placeholder="Escribí el significado..."
                    placeholderTextColor={colors.textMuted}
                  />
                )}
              </View>

              <TouchableOpacity style={[styles.createBtn, { backgroundColor: colors.primary, marginTop: Spacing.md }]} onPress={handleSaveGeneric}>
                <Ionicons name="add-circle" size={20} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.createBtnText}>Guardar tarjeta en {currentDeck?.name}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
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
  topTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  deckPickerSection: {
    marginBottom: Spacing.md,
  },
  deckPickerLabel: {
    ...Typography.bodySmall,
    marginBottom: 6,
  },
  deckChipsScroll: {
    flexDirection: 'row',
  },
  deckChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: Spacing.xs,
    borderWidth: 1,
  },
  deckChipFlag: {
    fontSize: 16,
    marginRight: 6,
  },
  deckChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  searchIcon: { marginRight: Spacing.sm },
  loader: { marginLeft: Spacing.sm },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: Spacing.md,
    fontSize: 16,
  },
  card: {
    borderRadius: 14,
    padding: Spacing.sm + 4,
    marginBottom: Spacing.sm + 2,
    borderWidth: 1,
    ...Shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  wordMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  wordTextGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
    marginRight: Spacing.xs,
  },
  japaneseKanji: {
    fontSize: 22,
    fontWeight: 'bold',
    marginRight: Spacing.xs,
    includeFontPadding: false,
    paddingBottom: 2
  },
  readingBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    marginRight: Spacing.xs,
    alignSelf: 'center',
  },
  readingBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  cardBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  categoryBadge: {
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.35)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    includeFontPadding: false,
  },
  levelBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  levelBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    includeFontPadding: false,
  },
  char: {
    ...Typography.chineseMedium,
    fontSize: 22,
    marginRight: Spacing.xs,
    includeFontPadding: false,
  },
  alphabeticWord: {
    fontSize: 20,
    fontWeight: 'bold',
    includeFontPadding: false,
  },
  pinyinContainer: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    marginRight: Spacing.xs,
    alignSelf: 'center',
    marginTop: 3,
  },
  pinyin: {
    ...Typography.body,
    fontSize: 13,
    fontWeight: '500',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  audioIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  saveBtn: {
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meanings: {
    ...Typography.bodySmall,
    fontSize: 13,
    lineHeight: 18,
  },
  translationRow: {
    marginTop: Spacing.xs,
  },
  translationLabel: {
    ...Typography.bodySmall,
    marginBottom: 4,
  },
  editableMeaningInput: {
    padding: Spacing.sm,
    borderRadius: 10,
    fontSize: 15,
  },
  emptySearchBox: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptySearchText: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  manualAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: 12,
  },
  manualAddBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  builderContainer: {
    flex: 1,
  },
  builderHeaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  builderHeaderText: {
    ...Typography.bodySmall,
    marginLeft: Spacing.sm,
    flex: 1,
  },
  previewBox: {
    padding: Spacing.md,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  previewLabel: {
    ...Typography.bodySmall,
  },
  previewHanzi: {
    fontSize: 36,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  previewPinyin: {
    ...Typography.body,
    fontWeight: '600',
  },
  syllableRow: {
    marginBottom: Spacing.md,
  },
  syllableLabel: {
    ...Typography.bodySmall,
    marginBottom: Spacing.xs,
  },
  syllableTag: {
    fontWeight: 'bold',
  },
  candidatesScroll: {
    flexDirection: 'row',
  },
  chip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    marginRight: Spacing.xs,
  },
  chipText: {
    fontSize: 20,
  },
  chipPinyin: {
    fontSize: 10,
    marginTop: 2,
  },
  createBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: 14,
    ...Shadows.card,
  },
  createBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  builderMeaningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  builderMeaningInput: {
    flex: 1,
    paddingVertical: Spacing.md,
    fontSize: 16,
  },
  builderLoader: {
    marginLeft: Spacing.xs,
  },
});

