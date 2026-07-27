import React, { useState, useEffect } from 'react';
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
import { searchByPinyin, SearchResult, DictionaryEntry } from '../../lib/search-engine';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, Shadows } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { saveWords, saveCustomWord } from '../../lib/word-service';
import { getDefaultDeckId } from '../../lib/deck-service';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Estados para el Word Builder (almacena la DictionaryEntry elegida por sílaba)
  const [selectedEntries, setSelectedEntries] = useState<{ [syllableIndex: number]: DictionaryEntry }>({});
  const [customMeaning, setCustomMeaning] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const router = useRouter();

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.trim() === '') {
      setResults(null);
      setSelectedEntries({});
      setCustomMeaning('');
      return;
    }
    setIsSearching(true);
    const res = await searchByPinyin(text);
    setResults(res);

    // Inicializar primera opción por cada sílaba en el Word Builder
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
  };

  // Construir la palabra en caracteres y el pinyin con tonos
  const builtHanzi = results?.syllableGroups
    ? results.syllableGroups.map((_, idx) => selectedEntries[idx]?.simplified || '').join('')
    : '';

  const builtPinyin = results?.syllableGroups
    ? results.syllableGroups.map((_, idx) => selectedEntries[idx]?.pinyinDisplay || '').join(' ')
    : query;

  // Auto-traducción en español usando Google Translate API + fallback síncrono
  useEffect(() => {
    if (!builtHanzi || builtHanzi.includes('?')) return;

    let isMounted = true;
    const fetchAutoTranslation = async () => {
      setIsTranslating(true);
      try {
        // 1. Intentar con Google Translate API
        const response = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=es&dt=t&q=${encodeURIComponent(builtHanzi)}`
        );
        const data = await response.json();
        
        if (isMounted && data && data[0] && data[0][0] && data[0][0][0]) {
          const translation = data[0][0][0].trim();
          if (translation && translation.toLowerCase() !== builtHanzi.toLowerCase()) {
            setCustomMeaning(translation);
          }
        }
      } catch (e) {
        // Fallback: Concatenar los significados locales de los caracteres seleccionados
        if (isMounted && results?.syllableGroups) {
          const charMeanings = results.syllableGroups
            .map((_, idx) => {
              const entry = selectedEntries[idx];
              if (!entry) return '';
              try {
                const parsed = JSON.parse(entry.meanings);
                return parsed[0] || entry.meanings;
              } catch {
                return entry.meanings;
              }
            })
            .filter(Boolean)
            .join(' + ');

          if (charMeanings) {
            setCustomMeaning(charMeanings);
          }
        }
      } finally {
        if (isMounted) {
          setIsTranslating(false);
        }
      }
    };

    const timeout = setTimeout(fetchAutoTranslation, 300);
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [builtHanzi, selectedEntries]);

  const handleQuickSave = async (entry: DictionaryEntry) => {
    try {
      const deckId = await getDefaultDeckId();
      await saveWords(deckId, [entry]);
      Alert.alert('¡Guardado!', `"${entry.simplified}" fue agregada a tu mazo.`);
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar la palabra.');
    }
  };

  const handleSaveCustomWord = async () => {
    if (!results || results.syllableGroups.length === 0) return;

    if (!builtHanzi) {
      Alert.alert('Atención', 'Selecciona un carácter para cada sílaba.');
      return;
    }

    if (!customMeaning.trim()) {
      Alert.alert('Atención', 'Ingresa el significado en español para guardar.');
      return;
    }

    setIsSaving(true);
    try {
      const deckId = await getDefaultDeckId();
      await saveCustomWord(deckId, {
        simplified: builtHanzi,
        pinyinDisplay: builtPinyin, // Guarda el pinyin CON tonos reales
        meanings: customMeaning.trim(),
      });
      Alert.alert('¡Palabra Creada!', `"${builtHanzi}" (${builtPinyin}) se guardó en tu mazo.`, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      Alert.alert('Error', 'No se pudo crear la palabra.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectCandidateForSyllable = (syllableIdx: number, candidate: DictionaryEntry) => {
    setSelectedEntries(prev => ({ ...prev, [syllableIdx]: candidate }));
  };

  return (
    <View style={styles.container}>
      {/* Header con botón atrás */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Buscar o Agregar Pinyin</Text>
      </View>

      {/* Input de búsqueda */}
      <View style={styles.inputContainer}>
        <Ionicons name="search" size={20} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.input}
          placeholder="Escribí pinyin (ej. xihuan, xiela)"
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={handleSearch}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={true}
        />
        {isSearching && <ActivityIndicator color={Colors.primary} style={styles.loader} />}
      </View>

      {results?.error && <Text style={styles.errorText}>{results.error}</Text>}

      {/* CASO 1: Coincidencias Exactas en el Diccionario Local */}
      {results && results.exactMatches.length > 0 && (
        <FlatList
          data={results.exactMatches}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: Spacing.xl }}
          renderItem={({ item }) => {
            let meaningsList: string[] = [];
            try {
              meaningsList = JSON.parse(item.meanings);
            } catch {
              meaningsList = [item.meanings];
            }
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.char}>{item.simplified}</Text>
                  <View style={styles.pinyinContainer}>
                    <Text style={styles.pinyin}>{item.pinyinDisplay}</Text>
                  </View>
                  <TouchableOpacity style={styles.saveBtn} onPress={() => handleQuickSave(item)}>
                    <Ionicons name="add" size={24} color={Colors.background} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.meanings}>{meaningsList.join(', ')}</Text>
              </View>
            );
          }}
        />
      )}

      {/* CASO 2: Sin coincidencia exacta -> WORD BUILDER por sílabas + Auto-Traducción API */}
      {results && results.exactMatches.length === 0 && results.syllableGroups.length > 0 && (
        <ScrollView style={styles.builderContainer} contentContainerStyle={{ paddingBottom: 60 }}>
          <View style={styles.builderHeaderBox}>
            <Ionicons name="sparkles" size={20} color={Colors.primary} />
            <Text style={styles.builderHeaderText}>
              Armando palabra por sílabas. Seleccioná los caracteres deseados:
            </Text>
          </View>

          {/* Vista previa de la palabra armada (con caracteres y pinyin con tonos) */}
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Resultado armado:</Text>
            <Text style={styles.previewHanzi}>{builtHanzi}</Text>
            <Text style={styles.previewPinyin}>{builtPinyin}</Text>
          </View>

          {/* Filas de caracteres por sílaba */}
          {results.syllableGroups.map((group, syllableIdx) => (
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
                      onPress={() => selectCandidateForSyllable(syllableIdx, cand)}
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

          {/* Input de Significado con indicador de Auto-Traducción */}
          <View style={styles.meaningInputContainer}>
            <View style={styles.meaningLabelRow}>
              <Text style={styles.meaningLabel}>Significado en español:</Text>
              {isTranslating && (
                <View style={styles.translatingBadge}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.translatingText}>Consultando traducción...</Text>
                </View>
              )}
            </View>
            <TextInput
              style={styles.meaningInput}
              placeholder="Ej. Gracias (informal)"
              placeholderTextColor={Colors.textMuted}
              value={customMeaning}
              onChangeText={setCustomMeaning}
            />
          </View>

          {/* Botón Guardar */}
          <TouchableOpacity
            style={[styles.createBtn, isSaving && { opacity: 0.7 }]}
            onPress={handleSaveCustomWord}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color={Colors.background} style={{ marginRight: 8 }} />
                <Text style={styles.createBtnText}>Guardar palabra armada</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.md, backgroundColor: Colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  backBtn: {
    padding: Spacing.xs,
    marginRight: Spacing.sm,
  },
  topTitle: {
    ...Typography.h2,
    color: Colors.text,
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
    color: Colors.text,
    paddingVertical: Spacing.md,
    fontSize: 16,
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
    marginBottom: Spacing.sm,
  },
  char: {
    ...Typography.chineseMedium,
    marginRight: Spacing.md,
  },
  pinyinContainer: {
    backgroundColor: Colors.surfaceHighlight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 8,
    flex: 1,
    alignSelf: 'flex-start',
  },
  pinyin: {
    ...Typography.body,
    fontWeight: '500',
    color: Colors.primaryHover,
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
  },
  errorText: {
    color: Colors.danger,
    textAlign: 'center',
    marginVertical: Spacing.md,
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
  meaningInputContainer: {
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  meaningLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  meaningLabel: {
    ...Typography.bodySmall,
    color: Colors.textMuted,
  },
  translatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  translatingText: {
    ...Typography.bodySmall,
    fontSize: 12,
    color: Colors.primary,
    marginLeft: 4,
  },
  meaningInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.md,
    color: Colors.text,
    fontSize: 16,
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
