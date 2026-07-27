import { db } from '../db';
import { dictionaryEntries } from '../db/dict-schema';
import { eq } from 'drizzle-orm';
import { toSearchKey } from './pinyin-utils';
import { bestSegmentation } from './pinyin-segmenter';

export type DictionaryEntry = typeof dictionaryEntries.$inferSelect;

export interface SearchResult {
  entries: DictionaryEntry[];
  segmentation?: string[];
  error?: string;
}

export function searchByPinyin(rawInput: string): SearchResult {
  if (!rawInput.trim()) return { entries: [] };
  
  const searchKey = toSearchKey(rawInput);
  
  const entries = db.select().from(dictionaryEntries).where(eq(dictionaryEntries.pinyinKey, searchKey)).all();
  
  if (entries.length > 0) {
    return { entries };
  }

  const segmentation = bestSegmentation(searchKey);
  
  if (segmentation.length === 0) {
    return { entries: [], error: 'Pinyin no reconocido' };
  }
  
  const segmentedEntries: DictionaryEntry[] = [];
  for (const syllable of segmentation) {
    const syllableEntries = db.select().from(dictionaryEntries).where(eq(dictionaryEntries.pinyinKey, syllable)).all();
    segmentedEntries.push(...syllableEntries);
  }
  
  return { 
    entries: segmentedEntries, 
    segmentation 
  };
}
