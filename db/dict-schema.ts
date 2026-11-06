import { sqliteTable, text, index, integer } from 'drizzle-orm/sqlite-core';

// Schema de solo lectura para el diccionario pre-compilado.
// NO se usa para migraciones. Solo para tipar las consultas de Drizzle.
export const dictionaryEntries = sqliteTable('dictionary_entries', {
  id: text('id').primaryKey(),
  pinyinKey: text('pinyin_key').notNull(),
  simplified: text('simplified').notNull(),
  traditional: text('traditional').notNull(),
  pinyinDisplay: text('pinyin_display').notNull(),
  pinyinNumeric: text('pinyin_numeric').notNull(),
  meanings: text('meanings').notNull(),
}, (table) => {
  return {
    pinyinKeyIdx: index('idx_pinyin_key').on(table.pinyinKey),
  };
});

// Japonés: palabras comunes de JMdict (scripts/build-japanese-dictionary.ts). Una fila por par escritura +
// lectura de cada palabra; las palabras solo en kana tienen kanji vacío.
export const japaneseDictionaryEntries = sqliteTable('japanese_dictionary_entries', {
  id: text('id').primaryKey(),
  /** Palabra de JMdict a la que pertenece la fila (agrupa sus escrituras y lecturas) */
  entryId: text('entry_id').notNull(),
  /** Orden de la escritura/lectura dentro de la palabra (0 = la principal) */
  formOrder: integer('form_order').notNull(),
  romajiKey: text('romaji_key').notNull(),
  /** Lectura en hiragana (para buscar y comparar) */
  hiragana: text('hiragana').notNull(),
  /** Lectura como se escribe (テレビ en katakana) */
  kana: text('kana').notNull(),
  kanji: text('kanji').notNull(),
  /** JSON: significados en inglés por acepción, [["to eat"], ["to live on", "to subsist on"]] */
  meanings: text('meanings').notNull(),
  /** JSON: tipo de palabra con los nombres de Jisho ("Ichidan verb", "Noun"…) */
  partsOfSpeech: text('parts_of_speech').notNull(),
  jlptLevel: text('jlpt_level'),
  isCommon: integer('is_common').notNull(),
});
