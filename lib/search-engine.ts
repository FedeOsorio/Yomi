import { db } from '../db';
import { dictionaryEntries } from '../db/dict-schema';
import { eq } from 'drizzle-orm';
import { toSearchKey } from './pinyin-utils';
import { bestSegmentation } from './pinyin-segmenter';

export type DictionaryEntry = typeof dictionaryEntries.$inferSelect;

export interface SyllableGroup {
  syllable: string;
  candidates: DictionaryEntry[];
}

export interface SearchResult {
  exactMatches: DictionaryEntry[];
  syllableGroups: SyllableGroup[];
  segmentation?: string[];
  error?: string;
}

export function searchByPinyin(rawInput: string): SearchResult {
  if (!rawInput.trim()) {
    return { exactMatches: [], syllableGroups: [] };
  }
  
  const searchKey = toSearchKey(rawInput);
  
  // 1. Buscar coincidencias exactas
  const exactMatches = db
    .select()
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.pinyinKey, searchKey))
    .all();
  
  if (exactMatches.length > 0) {
    return { exactMatches, syllableGroups: [] };
  }

  // 2. Si no hay coincidencias exactas, segmentar el pinyin en sílabas
  const segmentation = bestSegmentation(searchKey);
  
  if (segmentation.length === 0) {
    return { exactMatches: [], syllableGroups: [], error: 'Pinyin no reconocido' };
  }
  
  // 3. Obtener candidatos de 1 solo carácter para cada sílaba (Deduplicados por caracter simplificado)
  const syllableGroups: SyllableGroup[] = [];
  
  for (const syllable of segmentation) {
    const rawCandidates = db
      .select()
      .from(dictionaryEntries)
      .where(eq(dictionaryEntries.pinyinKey, syllable))
      .all()
      .filter((entry) => entry.simplified.length === 1);

    // Deduplicar caracteres repetidos
    const seen = new Set<string>();
    const uniqueCandidates: DictionaryEntry[] = [];
    for (const cand of rawCandidates) {
      if (!seen.has(cand.simplified)) {
        seen.add(cand.simplified);
        uniqueCandidates.push(cand);
      }
    }

    syllableGroups.push({
      syllable,
      candidates: uniqueCandidates,
    });
  }
  
  return { 
    exactMatches: [], 
    syllableGroups, 
    segmentation 
  };
}
