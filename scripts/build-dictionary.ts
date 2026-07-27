import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

// Para correr este script: npx tsx scripts/build-dictionary.ts

const ASSETS_DIR = path.join(__dirname, '../assets/cedict');
const CEDICT_FILE = path.join(ASSETS_DIR, 'cedict_ts.u8');
const DB_FILE = path.join(ASSETS_DIR, 'dictionary.db');

const TONE_MAP: Record<string, string[]> = {
  'a': ['ā', 'á', 'ǎ', 'à'],
  'e': ['ē', 'é', 'ě', 'è'],
  'i': ['ī', 'í', 'ǐ', 'ì'],
  'o': ['ō', 'ó', 'ǒ', 'ò'],
  'u': ['ū', 'ú', 'ǔ', 'ù'],
  'v': ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
  'ü': ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

function extractToneNumber(syllable: string): { base: string, tone: number } {
  const match = syllable.match(/^([a-z:]+)([1-5]?)$/i);
  if (!match) return { base: syllable, tone: 5 };
  return { base: match[1], tone: match[2] ? parseInt(match[2]) : 5 };
}

function numericToDisplay(pinyinNumeric: string): string {
  const syllables = pinyinNumeric.toLowerCase().split(' ');
  const result = syllables.map(syl => {
    const { base, tone } = extractToneNumber(syl);
    if (tone === 5) return base.replace(/u:/g, 'ü').replace(/v/g, 'ü');
    
    let chars = base.split('');
    let targetIdx = -1;

    targetIdx = chars.findIndex(c => c === 'a' || c === 'e');
    if (targetIdx === -1 && base.includes('ou')) targetIdx = chars.indexOf('o');
    if (targetIdx === -1) {
      for (let i = chars.length - 1; i >= 0; i--) {
        if (['i', 'o', 'u', 'v', ':'].includes(chars[i])) {
          targetIdx = i;
          if (chars[i] === ':' && chars[i-1] === 'u') targetIdx = i - 1;
          break;
        }
      }
    }

    if (targetIdx !== -1) {
      const charToReplace = chars[targetIdx] === 'u' && chars[targetIdx+1] === ':' ? 'ü' : chars[targetIdx];
      const mapKey = charToReplace === 'v' ? 'ü' : charToReplace;
      if (TONE_MAP[mapKey]) {
        chars[targetIdx] = TONE_MAP[mapKey][tone - 1];
        if (charToReplace === 'ü' && base.includes('u:')) chars[targetIdx + 1] = '';
      }
    }
    
    return chars.join('').replace(/u:/g, 'ü').replace(/v/g, 'ü');
  });
  return result.join('');
}

function toSearchKey(pinyinNumeric: string): string {
  return pinyinNumeric
    .toLowerCase()
    .replace(/[1-5 ]/g, '')
    .replace(/u:/g, 'v')
    .replace(/ü/g, 'v');
}

async function buildDictionary() {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }

  if (!fs.existsSync(CEDICT_FILE)) {
    console.error(`ERROR: Archivo CC-CEDICT no encontrado en ${CEDICT_FILE}`);
    console.error('Por favor, descarga cedict_1_0_ts_utf-8_mdbg.txt de MDBG y ponlo en la carpeta assets/cedict/');
    process.exit(1);
  }

  if (fs.existsSync(DB_FILE)) {
    fs.unlinkSync(DB_FILE);
  }

  const db = new sqlite3.Database(DB_FILE);

  db.serialize(() => {
    db.run(`
      CREATE TABLE dictionary_entries (
        id TEXT PRIMARY KEY,
        pinyin_key TEXT NOT NULL,
        simplified TEXT NOT NULL,
        traditional TEXT NOT NULL,
        pinyin_display TEXT NOT NULL,
        pinyin_numeric TEXT NOT NULL,
        meanings TEXT NOT NULL
      )
    `);

    db.run(`CREATE INDEX idx_pinyin_key ON dictionary_entries(pinyin_key)`);

    const stmt = db.prepare('INSERT INTO dictionary_entries VALUES (?, ?, ?, ?, ?, ?, ?)');

    const fileContent = fs.readFileSync(CEDICT_FILE, 'utf-8');
    const lines = fileContent.split('\n');

    const regex = /^(\S+)\s(\S+)\s\[([^\]]+)\]\s\/(.+)\/$/;
    let count = 0;
    const uniqueSyllables = new Set<string>();

    db.exec('BEGIN TRANSACTION');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('#') || trimmedLine === '') continue;

      const match = trimmedLine.match(regex);
      if (match) {
        const [, traditional, simplified, pinyinNumeric, meaningsRaw] = match;
        const meanings = JSON.stringify(meaningsRaw.split('/').filter(Boolean));
        const pinyinKey = toSearchKey(pinyinNumeric);
        const pinyinDisplay = numericToDisplay(pinyinNumeric);
        
        pinyinNumeric.toLowerCase().split(' ').forEach(syl => {
          const { base } = extractToneNumber(syl);
          // normalize u: and v to v for consistency in search keys
          const normalizedBase = base.replace(/u:/g, 'v').replace(/ü/g, 'v');
          if (normalizedBase.length > 0 && /^[a-z]+$/.test(normalizedBase)) {
            uniqueSyllables.add(normalizedBase);
          }
        });

        const id = `${count}`;

        stmt.run(id, pinyinKey, simplified, traditional, pinyinDisplay, pinyinNumeric, meanings);
        count++;
      }
    }

    stmt.finalize();
    db.exec('COMMIT');

    console.log(`Se insertaron ${count} entradas en dictionary.db`);

    // Guardar syllables
    const constantsDir = path.join(__dirname, '../constants');
    if (!fs.existsSync(constantsDir)) fs.mkdirSync(constantsDir, { recursive: true });
    
    const syllablesArray = Array.from(uniqueSyllables).sort();
    const syllablesFileContent = `export const PINYIN_SYLLABLES = new Set([
  ${syllablesArray.map(s => `'${s}'`).join(',\n  ')}
]);
`;
    fs.writeFileSync(path.join(constantsDir, 'pinyin-syllables.ts'), syllablesFileContent);
    console.log(`Se generó constants/pinyin-syllables.ts con ${uniqueSyllables.size} sílabas`);

  });

  db.close();
}

buildDictionary().catch(console.error);
