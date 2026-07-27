import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { searchByPinyin, SearchResult, DictionaryEntry } from '../../../lib/search-engine';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Typography, Shadows } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { saveWords } from '../../../lib/word-service';
import { getDefaultDeckId } from '../../../lib/deck-service';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const router = useRouter();

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.trim() === '') {
      setResults(null);
      return;
    }
    setIsSearching(true);
    const res = await searchByPinyin(text);
    setResults(res);
    setIsSearching(false);
  };

  const handleQuickSave = async (entry: DictionaryEntry) => {
    const deckId = await getDefaultDeckId();
    await saveWords(deckId, [entry]);
    // TODO: Show toast
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchHeader}>
        <Text style={styles.title}>Yomi</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="search" size={20} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.input}
            placeholder="Escribí pinyin (ej. xihuan)"
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isSearching && <ActivityIndicator color={Colors.primary} style={styles.loader} />}
        </View>
      </View>

      {results?.error && <Text style={styles.error}>{results.error}</Text>}
      {results?.segmentation && (
        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={16} color={Colors.primary} />
          <Text style={styles.infoText}>
            Detectado: <Text style={{fontWeight: 'bold'}}>{results.segmentation.join(' + ')}</Text>
          </Text>
          <TouchableOpacity 
            style={styles.pickerBtn}
            onPress={() => router.push({ pathname: '/search/picker', params: { candidates: JSON.stringify(results.entries) } })}
          >
            <Text style={styles.pickerBtnText}>Seleccionar...</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={results?.entries || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: Spacing.xl }}
        renderItem={({ item }) => {
          const meaningsList = JSON.parse(item.meanings);
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.md, backgroundColor: Colors.background },
  searchHeader: { marginBottom: Spacing.lg, marginTop: Spacing.xl },
  title: { ...Typography.h1, marginBottom: Spacing.md, color: Colors.primary },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
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
  error: { color: Colors.danger, marginBottom: Spacing.sm },
  infoBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: Colors.surfaceHighlight,
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  infoText: { color: Colors.text, marginLeft: Spacing.sm, flex: 1 },
  pickerBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 8,
  },
  pickerBtnText: {
    color: Colors.background,
    fontWeight: 'bold',
  }
});
