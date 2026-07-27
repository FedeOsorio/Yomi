import { sqliteTable, text, integer, real, index, primaryKey } from 'drizzle-orm/sqlite-core';

// ============================================================
// NOTA: La tabla dictionary_entries NO está aquí.
// Vive en su propia base de datos (dictDb) pre-compilada
// desde el asset y se consulta con SQL directo.
// ============================================================

// --- Tablas del usuario (manejadas por Drizzle ORM) ---

export const decks = sqliteTable('decks', {
  id: text('id').primaryKey(),
  languageCode: text('language_code').notNull().default('zh-CN'),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const words = sqliteTable('words', {
  id: text('id').primaryKey(),
  deckId: text('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  simplified: text('simplified').notNull(),
  traditional: text('traditional').notNull(),
  pinyinDisplay: text('pinyin_display').notNull(),
  pinyinNumeric: text('pinyin_numeric').notNull(),
  meanings: text('meanings').notNull(), // JSON string
  auxiliaryInfo: text('auxiliary_info'), // JSON string
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => {
  return {
    wordsDeckIdx: index('idx_words_deck').on(table.deckId),
  };
});

export const sentences = sqliteTable('sentences', {
  id: text('id').primaryKey(),
  deckId: text('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  textContent: text('text_content').notNull(),
  readingContent: text('reading_content').notNull(),
  translation: text('translation').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => {
  return {
    sentencesDeckIdx: index('idx_sentences_deck').on(table.deckId),
  };
});

export const sentenceWords = sqliteTable('sentence_words', {
  sentenceId: text('sentence_id').notNull().references(() => sentences.id, { onDelete: 'cascade' }),
  wordId: text('word_id').notNull().references(() => words.id, { onDelete: 'cascade' }),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.sentenceId, table.wordId] }),
  };
});

export const srsItems = sqliteTable('srs_items', {
  id: text('id').primaryKey(),
  itemType: text('item_type').notNull(), // 'word' or 'sentence'
  itemId: text('item_id').notNull(),
  
  // Desnormalizado para evitar joins
  displayText: text('display_text').notNull(),
  displayReading: text('display_reading').notNull(),
  displayMeaning: text('display_meaning').notNull(),
  
  // FSRS fields
  state: integer('state').notNull(), 
  due: integer('due', { mode: 'timestamp' }).notNull(),
  stability: real('stability').notNull(),
  difficulty: real('difficulty').notNull(),
  elapsedDays: integer('elapsed_days').notNull(),
  scheduledDays: integer('scheduled_days').notNull(),
  reps: integer('reps').notNull(),
  lapses: integer('lapses').notNull(),
  lastReview: integer('last_review', { mode: 'timestamp' }),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => {
  return {
    srsDueIdx: index('idx_srs_due').on(table.due),
    srsTypeItemIdx: index('idx_srs_type_item').on(table.itemType, table.itemId),
  };
});
