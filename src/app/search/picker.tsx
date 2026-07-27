import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Spacing, Typography, Shadows } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { DictionaryEntry } from '../../../lib/search-engine';
import { getDefaultDeckId } from '../../../lib/deck-service';
import { saveWords } from '../../../lib/word-service';

export default function PickerScreen() {
  const { candidates } = useLocalSearchParams();
  const router = useRouter();
  const entries: DictionaryEntry[] = candidates ? JSON.parse(candidates as string) : [];
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleConfirm = async () => {
    if (selectedIds.size === 0) return;
    
    const selectedEntries = entries.filter(e => selectedIds.has(e.id));
    const deckId = await getDefaultDeckId();
    await saveWords(deckId, selectedEntries);
    
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Seleccioná los caracteres correctos para armar la palabra:</Text>
      
      <FlatList
        data={entries}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const isSelected = selectedIds.has(item.id);
          const meaningsList = JSON.parse(item.meanings);
          
          return (
            <TouchableOpacity 
              style={[styles.card, isSelected && styles.cardSelected]} 
              activeOpacity={0.7}
              onPress={() => toggleSelection(item.id)}
            >
              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                {isSelected && <Ionicons name="checkmark" size={16} color={Colors.background} />}
              </View>
              <View style={styles.content}>
                <View style={styles.row}>
                  <Text style={styles.char}>{item.simplified}</Text>
                  <Text style={styles.pinyin}>{item.pinyinDisplay}</Text>
                </View>
                <Text style={styles.meanings} numberOfLines={2}>{meaningsList.join(', ')}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
      
      <TouchableOpacity 
        style={[styles.confirmBtn, selectedIds.size === 0 && styles.confirmBtnDisabled]}
        disabled={selectedIds.size === 0}
        onPress={handleConfirm}
      >
        <Text style={styles.confirmBtnText}>
          Guardar {selectedIds.size > 0 ? selectedIds.size : ''} palabra(s)
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.md, backgroundColor: Colors.background },
  headerText: { ...Typography.body, marginBottom: Spacing.md },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceHighlight,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  checkboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  content: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  char: { ...Typography.h2, marginRight: Spacing.md },
  pinyin: { ...Typography.body, color: Colors.primaryHover },
  meanings: { ...Typography.bodySmall },
  confirmBtn: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  confirmBtnDisabled: {
    backgroundColor: Colors.border,
  },
  confirmBtnText: {
    ...Typography.body,
    fontWeight: 'bold',
    color: Colors.background,
  }
});
