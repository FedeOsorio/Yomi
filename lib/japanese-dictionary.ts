import { katakanaToHiragana } from './japanese-utils';

/**
 * Consultas al diccionario japonés de la app (JMdict, palabras comunes; tabla japanese_dictionary_entries de
 * assets/cedict/dictionary-v2.db). Funcionan sin internet.
 *
 * Reciben la base como parámetro: la app pasa la del teléfono (dictDb.$client) y scripts/voice-audit.ts la
 * del archivo, así se prueban sin el teléfono.
 */
export interface DictionaryClient {
  getAllAsync<T>(sql: string, params: (string | number)[]): Promise<T[]>;
}

interface Row {
  entry_id: string;
  kana: string;
  kanji: string;
  meanings: string;
  parts_of_speech: string;
  is_common: number;
}

/** Resultado con la forma de los de Jisho (lo que espera searchJapanese). */
export interface JishoLikeItem {
  slug: string;
  is_common: boolean;
  jlpt: string[];
  japanese: { word?: string; reading: string }[];
  senses: { english_definitions: string[]; parts_of_speech: string[]; tags: string[] }[];
}

/**
 * Palabras cuya escritura o lectura es alguno de los términos o empieza con él: primero las exactas, después
 * las comunes y las más cortas (hasta 30 por término).
 */
export async function searchLocalDictionary(client: DictionaryClient, terms: string[]): Promise<JishoLikeItem[]> {
  try {
    const entryIds: string[] = [];
    for (const term of terms) {
      const hira = katakanaToHiragana(term);
      // Rangos en vez de LIKE: así se usan los índices de kanji y de hiragana
      const found = await client.getAllAsync<{ entry_id: string }>(
        `SELECT entry_id FROM japanese_dictionary_entries
         WHERE kanji = ? OR hiragana = ? OR (kanji >= ? AND kanji < ?) OR (hiragana >= ? AND hiragana < ?)
         GROUP BY entry_id ORDER BY max(kanji = ? OR hiragana = ?) DESC, max(is_common) DESC, min(length(kana)) ASC
         LIMIT 30`,
        [term, hira, term, term + '￿', hira, hira + '￿', term, hira]
      );
      for (const r of found) if (!entryIds.includes(r.entry_id)) entryIds.push(r.entry_id);
    }
    if (entryIds.length === 0) return [];

    const rows = await client.getAllAsync<Row>(
      `SELECT entry_id, kana, kanji, meanings, parts_of_speech, is_common FROM japanese_dictionary_entries
       WHERE entry_id IN (${entryIds.map(() => '?').join(',')}) ORDER BY form_order`,
      entryIds
    );
    const byEntry = new Map<string, Row[]>();
    for (const r of rows) byEntry.set(r.entry_id, [...(byEntry.get(r.entry_id) ?? []), r]);

    return entryIds.flatMap((entryId) => {
      const forms = byEntry.get(entryId);
      if (!forms) return [];
      // La forma principal primero: la común de menor orden (como japanese[0] en Jisho)
      const primary = forms.find((f) => f.is_common) ?? forms[0];
      const senses: string[][] = JSON.parse(primary.meanings);
      const partsOfSpeech: string[] = JSON.parse(primary.parts_of_speech);
      return [
        {
          slug: `jmdict-${entryId}`,
          is_common: forms.some((f) => f.is_common),
          jlpt: [],
          japanese: [primary, ...forms.filter((f) => f !== primary)].map((f) => ({ word: f.kanji || undefined, reading: f.kana })),
          senses: senses.map((glosses, i) => ({
            english_definitions: glosses,
            parts_of_speech: i === 0 ? partsOfSpeech : [],
            tags: [],
          })),
        },
      ];
    });
  } catch (err) {
    console.warn('[JapaneseDictionary] Error en la búsqueda:', err);
    return [];
  }
}

/** Lectura principal de una palabra escrita en kanji ('' si el diccionario no la tiene). */
export async function localReading(client: DictionaryClient, word: string): Promise<string> {
  try {
    const [row] = await client.getAllAsync<{ hiragana: string }>(
      'SELECT hiragana FROM japanese_dictionary_entries WHERE kanji = ? ORDER BY is_common DESC, form_order ASC LIMIT 1',
      [word]
    );
    return row?.hiragana ?? '';
  } catch {
    return '';
  }
}
