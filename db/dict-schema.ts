import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

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
