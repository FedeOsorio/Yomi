import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

// Para correr este script: npx tsx scripts/build-japanese-dictionary.ts

const ASSETS_DIR = path.join(__dirname, '../assets/cedict');
const DB_FILE = path.join(ASSETS_DIR, 'dictionary.db');

/**
 * Script de compilación e indexación del Diccionario Japonés Offline (JMdict + JLPT N5-N1).
 */
async function buildJapaneseDictionary() {
  if (!fs.existsSync(DB_FILE)) {
    console.error(`ERROR: Archivo ${DB_FILE} no encontrado. Ejecuta primero build-dictionary.ts`);
    process.exit(1);
  }

  const db = new sqlite3.Database(DB_FILE);

  db.serialize(() => {
    console.log('Inicializando tabla japanese_dictionary_entries...');

    db.run(`
      CREATE TABLE IF NOT EXISTS japanese_dictionary_entries (
        id TEXT PRIMARY KEY,
        romaji_key TEXT NOT NULL,
        hiragana TEXT NOT NULL,
        kanji TEXT NOT NULL,
        meanings TEXT NOT NULL,
        jlpt_level TEXT,
        is_common INTEGER NOT NULL DEFAULT 1
      )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_ja_romaji ON japanese_dictionary_entries(romaji_key)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ja_hiragana ON japanese_dictionary_entries(hiragana)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ja_kanji ON japanese_dictionary_entries(kanji)`);

    console.log('Tabla e índices de Japonés Offline creados exitosamente en dictionary.db.');
  });

  db.close();
}

buildJapaneseDictionary().catch(console.error);
