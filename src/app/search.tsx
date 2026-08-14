import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  TextInput, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  ScrollView, 
  Alert 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { searchByPinyin, SearchResult, DictionaryEntry } from '../../lib/search-engine';
import { searchJapanese, JapaneseEntry } from '../../lib/japanese-search';
import { saveWords, saveCustomWord, saveGenericWord } from '../../lib/word-service';
import { getDecksWithStats, DeckWithStats, SUPPORTED_LANGUAGES } from '../../lib/deck-service';
import { speakText } from '../../lib/audio-service';
import { Colors, Spacing, Typography, Shadows } from '../constants/theme';
import { getQuickHskLevel } from '../../lib/hsk-data';

export default function SearchScreen() {
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
    setChineseResults(null);
    setJapaneseResults([]);
    setGenericTranslation('');
    setSelectedEntries({});
  };

  const langCode = currentDeck?.languageCode || 'zh-CN';
  const isChinese = langCode.startsWith('zh');
  const isJapanese = langCode.startsWith('ja');

  const currentLangMeta = SUPPORTED_LANGUAGES.find(l => l.code === langCode) || {
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
      } catch (e) {}
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

  // --- GUARDADO RÁPIDO JAPONÉS CON JLPT ---
  const handleQuickSaveJapanese = async (entry: JapaneseEntry) => {
    if (!selectedDeckId) return;
    try {
      await saveGenericWord(selectedDeckId, {
        text: entry.kanji,
        reading: entry.reading,
        meanings: JSON.stringify(entry.meanings),
        level: entry.level,
      });
      const levelLabel = entry.level ? ` [JLPT ${entry.level}]` : '';
      Alert.alert('¡Guardado!', `"${entry.kanji}" (${entry.reading})${levelLabel} fue agregada a "${currentDeck?.name}".`);
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la palabra.');
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Buscar o Reconocer Palabra</Text>
      </View>

      {/* Selector de Mazo */}
      <View style={styles.deckPickerSection}>
        <Text style={styles.deckPickerLabel}>Mazo de destino:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deckChipsScroll}>
          {decks.map((d) => {
            const isSelected = d.id === selectedDeckId;
            const langMeta = SUPPORTED_LANGUAGES.find(l => l.code === d.languageCode);
            return (
              <TouchableOpacity
                key={d.id}
                style={[styles.deckChip, isSelected && styles.deckChipSelected]}
                onPress={() => handleSelectDeck(d)}
              >
                <Text style={styles.deckChipFlag}>{langMeta?.flag || '📚'}</Text>
                <Text style={[styles.deckChipText, isSelected && styles.deckChipTextSelected]}>
                  {d.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Input Único de Reconocimiento */}
      <View style={styles.inputContainer}>
        <Ionicons name="search" size={20} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder={currentLangMeta.placeholder}
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={handleQueryChange}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={true}
        />
        {isSearching && <ActivityIndicator color={Colors.primary} style={styles.loader} />}
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
                <Text style={styles.emptySearchText}>
                  No se encontraron coincidencias para "{query}".
                </Text>
                <TouchableOpacity
                  style={styles.manualAddBtn}
                  onPress={() =>
                    handleQuickSaveJapanese({
                      id: 'custom',
                      kanji: query.trim(),
                      reading: query.trim(),
                      romaji: query.trim(),
                      meanings: [query.trim()],
                      isCommon: false,
                    })
                  }
                >
                  <Ionicons name="add-circle" size={18} color={Colors.background} style={{ marginRight: 6 }} />
                  <Text style={styles.manualAddBtnText}>Guardar "{query}" como tarjeta</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.wordMainRow}>
                  {/* Palabra */}
                  <Text style={styles.japaneseKanji}>{item.kanji}</Text>

                  {/* Badge de Fonética / Hiragana */}
                  {item.reading !== item.kanji && (
                    <View style={styles.readingBadge}>
                      <Text style={styles.readingBadgeText}>{item.reading}</Text>
                    </View>
                  )}
                </View>

                {/* Acciones: Badge JLPT al lado del Parlante y Guardar */}
                <View style={styles.actionButtonsRow}>
                  {item.level && (
                    <View style={styles.levelBadge}>
                      <Text style={styles.levelBadgeText}>JLPT {item.level}</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.audioIconBtn} onPress={() => handleSpeak(item.kanji)}>
                    <Ionicons name="volume-high" size={20} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={() => handleQuickSaveJapanese(item)}>
                    <Ionicons name="add" size={24} color={Colors.background} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.meanings}>{item.meanings.join(', ')}</Text>
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
                  <View style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View style={styles.wordMainRow}>
                        {/* Carácter Hanzi */}
                        <Text style={styles.char}>{item.simplified}</Text>

                        {/* Badge Pinyin */}
                        <View style={styles.pinyinContainer}>
                          <Text style={styles.pinyin}>{item.pinyinDisplay}</Text>
                        </View>
                      </View>

                      {/* Acciones: Badge HSK al lado del Parlante y Guardar */}
                      <View style={styles.actionButtonsRow}>
                        {hskNum && (
                          <View style={styles.levelBadge}>
                            <Text style={styles.levelBadgeText}>HSK {hskNum}</Text>
                          </View>
                        )}
                        <TouchableOpacity style={styles.audioIconBtn} onPress={() => handleSpeak(item.simplified)}>
                          <Ionicons name="volume-high" size={20} color={Colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.saveBtn} onPress={() => handleQuickSaveChinese(item)}>
                          <Ionicons name="add" size={24} color={Colors.background} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={styles.meanings}>{meaningsList.join(', ')}</Text>
                  </View>
                );
              }}
            />
          ) : (
            /* Constructor por sílabas si no hubo exacta */
            <ScrollView style={styles.builderContainer} contentContainerStyle={{ paddingBottom: 60 }}>
              <View style={styles.builderHeaderBox}>
                <Ionicons name="sparkles" size={20} color={Colors.primary} />
                <Text style={styles.builderHeaderText}>
                  Palabra armada por sílabas. Seleccioná los caracteres deseados:
                </Text>
              </View>

              <View style={styles.previewBox}>
                <Text style={styles.previewLabel}>Resultado:</Text>
                <Text style={styles.previewHanzi}>{builtHanzi}</Text>
                <Text style={styles.previewPinyin}>{builtPinyin}</Text>
              </View>

              {chineseResults.syllableGroups.map((group, syllableIdx) => (
                <View key={syllableIdx} style={styles.syllableRow}>
                  <Text style={styles.syllableLabel}>
                    Sílaba #{syllableIdx + 1}: <Text style={styles.syllableTag}>{group.syllable}</Text>
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.candidatesScroll}>
                    {group.candidates.map((cand) => {
                      const isSelected = selectedEntries[syllableIdx]?.id === cand.id;
                      return (
                        <TouchableOpacity
                          key={cand.id}
                          style={[styles.chip, isSelected && styles.chipSelected]}
                          onPress={() => setSelectedEntries(prev => ({ ...prev, [syllableIdx]: cand }))}
                        >
                          <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                            {cand.simplified}
                          </Text>
                          <Text style={[styles.chipPinyin, isSelected && styles.chipPinyinSelected]}>
                            {cand.pinyinDisplay}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ))}

              <TextInput
                style={[styles.input, { marginTop: Spacing.md, marginBottom: Spacing.md }]}
                placeholder="Significado en español..."
                placeholderTextColor={Colors.textMuted}
                value={chineseCustomMeaning}
                onChangeText={setChineseCustomMeaning}
              />

              <TouchableOpacity
                style={styles.createBtn}
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
                <Ionicons name="checkmark-circle" size={20} color={Colors.background} style={{ marginRight: 8 }} />
                <Text style={styles.createBtnText}>Guardar en {currentDeck?.name}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </>
      )}

      {/* CASO 3: OTROS IDIOMAS (Inglés, Español, etc.) -> Reconocimiento Directo + Guardado en 1 Tap */}
      {!isChinese && !isJapanese && query.trim().length > 0 && (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.wordMainRow}>
                <Text style={styles.alphabeticWord}>{query.trim()}</Text>
              </View>
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity style={styles.audioIconBtn} onPress={() => handleSpeak(query.trim())}>
                  <Ionicons name="volume-high" size={20} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveGeneric}>
                  <Ionicons name="add" size={24} color={Colors.background} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.translationRow}>
              <Text style={styles.translationLabel}>Traducción / Significado:</Text>
              {isGenericTranslating ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <TextInput
                  style={styles.editableMeaningInput}
                  value={genericTranslation}
                  onChangeText={setGenericTranslation}
                  placeholder="Escribí el significado..."
                  placeholderTextColor={Colors.textMuted}
                />
              )}
            </View>

            <TouchableOpacity style={[styles.createBtn, { marginTop: Spacing.md }]} onPress={handleSaveGeneric}>
              <Ionicons name="add-circle" size={20} color={Colors.background} style={{ marginRight: 6 }} />
              <Text style={styles.createBtnText}>Guardar tarjeta en {currentDeck?.name}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.md, backgroundColor: Colors.background, paddingTop: Spacing.xl },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  backBtn: {
    padding: Spacing.xs,
    marginRight: Spacing.sm,
  },
  topTitle: {
    ...Typography.h2,
    color: Colors.text,
  },
  deckPickerSection: {
    marginBottom: Spacing.md,
  },
  deckPickerLabel: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginBottom: 6,
  },
  deckChipsScroll: {
    flexDirection: 'row',
  },
  deckChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  deckChipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  deckChipFlag: {
    fontSize: 16,
    marginRight: 6,
  },
  deckChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  deckChipTextSelected: {
    color: Colors.background,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  searchIcon: { marginRight: Spacing.sm },
  loader: { marginLeft: Spacing.sm },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: Spacing.md,
    fontSize: 16,
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  wordMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  japaneseKanji: {
    fontSize: 26,
    fontWeight: 'bold',
    color: Colors.text,
    marginRight: Spacing.xs,
  },
  readingBadge: {
    backgroundColor: Colors.surfaceHighlight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: Spacing.xs,
  },
  readingBadgeText: {
    fontSize: 13,
    color: Colors.primaryHover,
    fontWeight: '600',
  },
  char: {
    ...Typography.chineseMedium,
    marginRight: Spacing.xs,
  },
  alphabeticWord: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
  },
  pinyinContainer: {
    backgroundColor: Colors.surfaceHighlight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: Spacing.xs,
  },
  pinyin: {
    ...Typography.body,
    fontWeight: '500',
    color: Colors.primaryHover,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    color: Colors.primary,
  },
  audioIconBtn: {
    backgroundColor: Colors.surfaceHighlight,
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meanings: {
    ...Typography.bodySmall,
    lineHeight: 20,
    color: Colors.text,
  },
  translationRow: {
    marginTop: Spacing.xs,
  },
  translationLabel: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  editableMeaningInput: {
    backgroundColor: Colors.surfaceHighlight,
    padding: Spacing.sm,
    borderRadius: 10,
    color: Colors.text,
    fontSize: 15,
  },
  emptySearchBox: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptySearchText: {
    ...Typography.body,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  manualAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: 12,
  },
  manualAddBtnText: {
    color: Colors.background,
    fontWeight: 'bold',
    fontSize: 14,
  },
  builderContainer: {
    flex: 1,
  },
  builderHeaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceHighlight,
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  builderHeaderText: {
    ...Typography.bodySmall,
    color: Colors.text,
    marginLeft: Spacing.sm,
    flex: 1,
  },
  previewBox: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewLabel: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },
  previewHanzi: {
    fontSize: 36,
    fontWeight: 'bold',
    color: Colors.primary,
    marginVertical: 4,
  },
  previewPinyin: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.primaryHover,
  },
  syllableRow: {
    marginBottom: Spacing.md,
  },
  syllableLabel: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  syllableTag: {
    color: Colors.primary,
    fontWeight: 'bold',
  },
  candidatesScroll: {
    flexDirection: 'row',
  },
  chip: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    marginRight: Spacing.xs,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 20,
    color: Colors.text,
  },
  chipTextSelected: {
    color: Colors.background,
    fontWeight: 'bold',
  },
  chipPinyin: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  chipPinyinSelected: {
    color: Colors.background,
  },
  createBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderRadius: 14,
    ...Shadows.card,
  },
  createBtnText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
