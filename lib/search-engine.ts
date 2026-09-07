import { dictDb } from '../db';
import { dictionaryEntries } from '../db/dict-schema';
import { eq, or, like } from 'drizzle-orm';
import { toSearchKey, getExplicitTone, extractToneNumber, extractTonesFromDisplay } from './pinyin-utils';
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
  if (!rawInput || !rawInput.trim() || !dictDb) {
    return { exactMatches: [], syllableGroups: [] };
  }

  const trimmed = rawInput.trim();
  const containsHanzi = /[\u4e00-\u9faf]/.test(trimmed);

  // A) Búsqueda directa por caracteres Chinos (Hanzi / Ideogramas)
  if (containsHanzi) {
    const exactHanzi = dictDb
      .select()
      .from(dictionaryEntries)
      .where(
        or(
          eq(dictionaryEntries.simplified, trimmed),
          eq(dictionaryEntries.traditional, trimmed)
        )
      )
      .all();

    if (exactHanzi.length > 0) {
      return { exactMatches: exactHanzi, syllableGroups: [] };
    }

    const partialHanzi = dictDb
      .select()
      .from(dictionaryEntries)
      .where(
        or(
          like(dictionaryEntries.simplified, `%${trimmed}%`),
          like(dictionaryEntries.traditional, `%${trimmed}%`)
        )
      )
      .limit(12)
      .all();

    return { exactMatches: partialHanzi, syllableGroups: [] };
  }
  
  // B) Búsqueda por Pinyin fonético
  const searchKey = toSearchKey(trimmed);
  if (!searchKey) {
    return { exactMatches: [], syllableGroups: [] };
  }
  
  // 1. Coincidencias exactas por clave de Pinyin
  const exactMatches = dictDb
    .select()
    .from(dictionaryEntries)
    .where(eq(dictionaryEntries.pinyinKey, searchKey))
    .all();
  
  if (exactMatches.length > 0) {
    // Si el usuario especificó tonos en la búsqueda exacta, filtrar o priorizar coincidencias con esos tonos
    const inputTones = extractTonesFromDisplay(trimmed);
    const hasTone = /[1-5]/.test(trimmed) || extractTonesFromDisplay(trimmed).some(t => t !== 5);
    if (hasTone && inputTones.length > 0) {
      const toneFiltered = exactMatches.filter(entry => {
        const entryTones = extractTonesFromDisplay(entry.pinyinDisplay);
        return inputTones.every((t, i) => entryTones[i] === undefined || entryTones[i] === t);
      });
      if (toneFiltered.length > 0) {
        return { exactMatches: toneFiltered, syllableGroups: [] };
      }
    }
    return { exactMatches, syllableGroups: [] };
  }

  // 2. Si no hay coincidencias exactas, segmentar el pinyin en sílabas
  const segmentation = bestSegmentation(searchKey);
  
  if (segmentation.length === 0) {
    return { exactMatches: [], syllableGroups: [], error: 'Pinyin no reconocido' };
  }
  
  // 3. Mapear cada sílaba segmentada al fragmento del input original para detectar si tiene tono explícito
  let charCursor = 0;
  const syllableInfos: { syllable: string; originalText: string; tone?: number }[] = [];

  for (const plainSyl of segmentation) {
    let matched = '';
    while (charCursor < trimmed.length) {
      const ch = trimmed[charCursor];
      charCursor++;
      if (/\s/.test(ch)) {
        if (matched.length > 0) {
          break;
        }
        continue;
      }
      matched += ch;
      if (toSearchKey(matched) === plainSyl) {
        // Si el siguiente carácter es un número de tono (ej: mei2), incluirlo
        if (charCursor < trimmed.length && /[1-5]/.test(trimmed[charCursor])) {
          matched += trimmed[charCursor];
          charCursor++;
        }
        break;
      }
    }

    const tone = getExplicitTone(matched);
    syllableInfos.push({
      syllable: plainSyl,
      originalText: matched || plainSyl,
      tone,
    });
  }

  // 4. Candidatos de 1 solo carácter para cada sílaba (filtrando por tono si fue indicado)
  const syllableGroups: SyllableGroup[] = [];
  
  for (const info of syllableInfos) {
    const rawCandidates = dictDb
      .select()
      .from(dictionaryEntries)
      .where(eq(dictionaryEntries.pinyinKey, info.syllable))
      .all()
      .filter((entry) => entry.simplified.length === 1);

    const seen = new Set<string>();
    const uniqueCandidates: DictionaryEntry[] = [];
    for (const cand of rawCandidates) {
      if (!seen.has(cand.simplified)) {
        seen.add(cand.simplified);
        uniqueCandidates.push(cand);
      }
    }

    // Si el usuario especificó tono para esta sílaba particular (ej: "méi" o "mei2"), filtrar exclusivamente por ese tono
    let finalCandidates = uniqueCandidates;
    if (info.tone !== undefined) {
      const toneFiltered = uniqueCandidates.filter((cand) => {
        const candTone = extractToneNumber(cand.pinyinNumeric).tone;
        return candTone === info.tone;
      });
      if (toneFiltered.length > 0) {
        finalCandidates = toneFiltered;
      }
    }

    syllableGroups.push({
      syllable: info.originalText || info.syllable,
      candidates: finalCandidates,
    });
  }
  
  return { 
    exactMatches: [], 
    syllableGroups, 
    segmentation 
  };
}

/**
 * Obtiene o traduce automáticamente el significado en español para una palabra o combinación de caracteres Hanzi.
 */
export async function getChineseSpanishMeaning(
  hanzi: string,
  selectedCandidates?: DictionaryEntry[]
): Promise<string> {
  const trimmed = hanzi.trim();
  if (!trimmed) return '';

  // 1. Intentar traducir directamente con Google Translate (sl=zh-CN -> tl=es)
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=es&dt=t&q=${encodeURIComponent(trimmed)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data[0])) {
        const fullTranslation = data[0]
          .map((part: any) => (part && part[0] ? String(part[0]).trim() : ''))
          .filter(Boolean)
          .join(' ')
          .trim();
        if (fullTranslation) {
          return fullTranslation.charAt(0).toUpperCase() + fullTranslation.slice(1);
        }
      }
    }
  } catch (e) {
    // Si falla la red, continuamos con el fallback local
  }

  // 2. Fallback: Buscar si la palabra completa está en la base de datos local
  try {
    if (!dictDb) return '';
    const exactWord = dictDb
      .select()
      .from(dictionaryEntries)
      .where(
        or(
          eq(dictionaryEntries.simplified, trimmed),
          eq(dictionaryEntries.traditional, trimmed)
        )
      )
      .limit(1)
      .all();

    if (exactWord.length > 0) {
      try {
        const parsed = JSON.parse(exactWord[0].meanings);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Intentar traducir la primera definición en inglés a español
          try {
            const trRes = await fetch(
              `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(parsed[0])}`
            );
            const trData = await trRes.json();
            if (trData && trData[0] && trData[0][0] && trData[0][0][0]) {
              const trStr = String(trData[0][0][0]).trim();
              return trStr.charAt(0).toUpperCase() + trStr.slice(1);
            }
          } catch {}
          return String(parsed[0]);
        }
      } catch {
        return exactWord[0].meanings;
      }
    }
  } catch (e) {}

  // 3. Fallback: Si se pasaron candidatos individuales por sílaba, combinar sus significados
  if (selectedCandidates && selectedCandidates.length > 0) {
    const candidateMeanings = selectedCandidates.map((c) => {
      try {
        const parsed = JSON.parse(c.meanings);
        return Array.isArray(parsed) ? parsed[0] : c.meanings;
      } catch {
        return c.meanings;
      }
    }).filter(Boolean);

    if (candidateMeanings.length > 0) {
      return candidateMeanings.join(' + ');
    }
  }

  return '';
}

