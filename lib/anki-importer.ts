/**
 * Módulo desacoplado para análisis (parsing) y transformación de archivos exportados
 * desde Anki, CSV, TSV y texto plano hacia estructuras de datos universales de vocabulario.
 *
 * Este servicio NO depende de la UI ni de frameworks de presentación para garantizar
 * máxima escalabilidad, testabilidad y reutilización en cualquier entorno.
 */

import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import {
  AnkiCard,
  AnkiNote,
  buildAnkiCardItems,
  cleanHtmlAndAnkiTags,
  decodeMediaIndex,
  decodeNotetypeConfig,
  decodeTemplateConfig,
  decompressZstd,
  enrichVocabularyItem,
  isZstd,
  parseAnkiFuriganaSyntax,
  parseAnkiNotes,
  AnswerMode,
  buildFieldPlan,
  detectAnswerMode,
  ParsedVocabularyItem,
  prepareAnkiCollection,
} from './anki-collection';
import { AnkiNoteType, noteTypeMediaFiles } from './anki-template';
import { deleteFileQuietly, getMediaDir, invalidateMediaFilesCache, MediaKind, mediaFileName, mediaPath, sanitizeMediaName } from './media-service';
import { parseAux } from './word-aux';
import { openZip, ZipEntry } from './zip-reader';

export interface RawImportRow {
  [key: string]: string;
}

export { cleanHtmlAndAnkiTags, parseAnkiFuriganaSyntax } from './anki-collection';
export type { ParsedVocabularyItem } from './anki-collection';

export interface ColumnMapping {
  textColumnIndex: number;
  readingColumnIndex?: number;
  meaningColumnIndex: number;
  levelColumnIndex?: number;
}

export interface ParseResult {
  delimiter: string;
  hasHeader: boolean;
  headers: string[];
  sampleRows: string[][];
  suggestedMapping: ColumnMapping;
  items: ParsedVocabularyItem[];
  totalParsed: number;
  warnings: string[];
}

/**
 * Detecta automáticamente el delimitador más probable (coma, tabulación, punto y coma, pipe).
 */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return ',';

  const sampleLines = lines.slice(0, 10);
  const counts = {
    '\t': 0,
    ',': 0,
    ';': 0,
    '|': 0,
  };

  sampleLines.forEach((line) => {
    // Contar ocurrencias fuera de comillas
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (char === '\t') counts['\t']++;
        else if (char === ',') counts[',']++;
        else if (char === ';') counts[';']++;
        else if (char === '|') counts['|']++;
      }
    }
  });

  // El delimitador con mayor frecuencia consistente
  let bestDelimiter = ',';
  let maxCount = -1;
  for (const [delim, count] of Object.entries(counts)) {
    if (count > maxCount && count >= sampleLines.length) {
      maxCount = count;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

/**
 * Parsea una línea respetando comillas y delimitadores.
 */
export function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Saltar la comilla escapada
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Deduce automáticamente qué columna corresponde a la palabra, lectura y significado
 * según los nombres de los encabezados o los contenidos típicos.
 */
export function guessColumnMapping(headers: string[], firstRowSample?: string[]): ColumnMapping {
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

  let textIdx = -1;
  let readingIdx = -1;
  let meaningIdx = -1;
  let levelIdx = -1;

  // 1. Detección por palabras clave en encabezados
  normalizedHeaders.forEach((h, idx) => {
    if (textIdx === -1 && /^(kanji|hanzi|word|vocab|front|término|termino|palabra|caracter|expression|expr)$/i.test(h)) {
      textIdx = idx;
    } else if (readingIdx === -1 && /^(furigana|reading|lectura|pronunciación|pronunciacion|pinyin|kana|romaji|kana_reading)$/i.test(h)) {
      readingIdx = idx;
    } else if (meaningIdx === -1 && /^(meaning|meanings|significado|significados|translation|traducción|traduccion|definition|back|glossary)$/i.test(h)) {
      meaningIdx = idx;
    } else if (levelIdx === -1 && /^(level|jlpt|hsk|nivel|section)$/i.test(h)) {
      levelIdx = idx;
    }
  });

  // 2. Si no se encontró por encabezado exacto, probar coincidencias parciales
  if (textIdx === -1) {
    textIdx = normalizedHeaders.findIndex((h) => h.includes('word') || h.includes('kanji') || h.includes('front') || h.includes('term'));
  }
  if (readingIdx === -1) {
    readingIdx = normalizedHeaders.findIndex((h) => h.includes('read') || h.includes('furi') || h.includes('pinyin') || h.includes('kana'));
  }
  if (meaningIdx === -1) {
    meaningIdx = normalizedHeaders.findIndex((h) => h.includes('mean') || h.includes('trad') || h.includes('sign') || h.includes('back') || h.includes('def'));
  }

  // 3. Si aún no hay mapeo (o no había encabezados válidos), usar posiciones por defecto estándar
  const totalCols = headers.length > 0 ? headers.length : (firstRowSample?.length || 2);
  if (textIdx === -1) textIdx = 0;
  if (meaningIdx === -1) {
    meaningIdx = totalCols >= 3 ? 2 : (totalCols >= 2 ? 1 : 0);
  }
  if (readingIdx === -1 && totalCols >= 3 && textIdx !== 1 && meaningIdx !== 1) {
    readingIdx = 1;
  }

  return {
    textColumnIndex: textIdx >= 0 ? textIdx : 0,
    readingColumnIndex: readingIdx >= 0 && readingIdx !== textIdx && readingIdx !== meaningIdx ? readingIdx : undefined,
    meaningColumnIndex: meaningIdx >= 0 ? meaningIdx : 1,
    levelColumnIndex: levelIdx >= 0 ? levelIdx : undefined,
  };
}

/**
 * Determina si la primera fila representa encabezados descriptivos o datos directos.
 */
export function isHeaderRow(row: string[]): boolean {
  if (!row || row.length === 0) return false;
  const commonHeaderKeywords = [
    'kanji', 'furigana', 'romaji', 'meaning', 'section',
    'word', 'reading', 'translation', 'definition',
    'front', 'back', 'palabra', 'lectura', 'significado',
    'hanzi', 'pinyin', 'level', 'jlpt', 'hsk',
  ];

  const matchCount = row.filter((col) => {
    const clean = col.toLowerCase().trim();
    return commonHeaderKeywords.some((kw) => clean === kw || clean.includes(kw));
  }).length;

  return matchCount >= 1;
}

/**
 * Analiza texto completo exportado (CSV, TSV o TXT) y genera el resultado estructurado
 * con sugerencia de columnas y filas parseadas.
 */
export function parseVocabularyFile(content: string, customDelimiter?: string): ParseResult {
  const warnings: string[] = [];
  if (!content || !content.trim()) {
    return {
      delimiter: ',',
      hasHeader: false,
      headers: [],
      sampleRows: [],
      suggestedMapping: { textColumnIndex: 0, meaningColumnIndex: 1 },
      items: [],
      totalParsed: 0,
      warnings: ['El contenido está vacío.'],
    };
  }

  // Si el archivo es un paquete nativo Yomi (.yomi / JSON)
  if (isYomiPackage(content)) {
    try {
      const pkg = JSON.parse(content) as YomiDeckExportPackage;
      const items: ParsedVocabularyItem[] = (pkg.cards || []).map((c) => ({
        text: c.text,
        reading: c.reading || undefined,
        meanings: c.meanings,
        level: c.level || undefined,
      }));

      return {
        delimiter: 'Yomi (JSON)',
        hasHeader: true,
        headers: ['Palabra / Kanji', 'Lectura', 'Significados', 'Nivel'],
        sampleRows: items.slice(0, 5).map((it) => [it.text, it.reading || '', it.meanings.join(', '), it.level || '']),
        suggestedMapping: { textColumnIndex: 0, readingColumnIndex: 1, meaningColumnIndex: 2, levelColumnIndex: 3 },
        items,
        totalParsed: items.length,
        warnings: [],
      };
    } catch (e) {
      warnings.push('Error al procesar paquete Yomi, intentando como texto plano...');
    }
  }

  const rawLines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const delimiter = customDelimiter || detectDelimiter(content);

  const parsedGrid: string[][] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const cols = parseCsvLine(rawLines[i], delimiter);
    if (cols.some((c) => c.length > 0)) {
      parsedGrid.push(cols);
    }
  }

  if (parsedGrid.length === 0) {
    return {
      delimiter,
      hasHeader: false,
      headers: [],
      sampleRows: [],
      suggestedMapping: { textColumnIndex: 0, meaningColumnIndex: 1 },
      items: [],
      totalParsed: 0,
      warnings: ['No se encontraron filas con datos.'],
    };
  }

  const firstRow = parsedGrid[0];
  const hasHeader = isHeaderRow(firstRow);
  const headers = hasHeader ? firstRow : firstRow.map((_, i) => `Columna ${i + 1}`);
  const dataRows = hasHeader ? parsedGrid.slice(1) : parsedGrid;

  const mapping = guessColumnMapping(headers, dataRows[0]);
  const sampleRows = dataRows.slice(0, 5);

  // Convertir las filas a ParsedVocabularyItem
  const items: ParsedVocabularyItem[] = [];

  dataRows.forEach((row) => {
    const rawText = row[mapping.textColumnIndex] || '';
    const rawReading = mapping.readingColumnIndex !== undefined ? row[mapping.readingColumnIndex] : '';
    const rawMeaning = row[mapping.meaningColumnIndex] || '';
    const rawLevel = mapping.levelColumnIndex !== undefined ? row[mapping.levelColumnIndex] : '';

    if (!rawText.trim() && !rawMeaning.trim()) {
      return; // Fila vacía
    }

    // Limpieza de HTML y furigana
    const ankiExtracted = parseAnkiFuriganaSyntax(rawText);
    const mainText = ankiExtracted.text || cleanHtmlAndAnkiTags(rawText);
    const reading = cleanHtmlAndAnkiTags(rawReading) || ankiExtracted.reading || '';
    const cleanMeaningStr = cleanHtmlAndAnkiTags(rawMeaning);

    // Separar significados múltiples delimitados por punto y coma, comas internas o saltos de línea
    const splitMeanings = cleanMeaningStr
      .split(/[;\n\r\/]+/)
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    const meanings = splitMeanings.length > 0 ? splitMeanings : [cleanMeaningStr];

    items.push(enrichVocabularyItem(mainText, reading, meanings, cleanHtmlAndAnkiTags(rawLevel)));
  });

  return {
    delimiter,
    hasHeader,
    headers,
    sampleRows,
    suggestedMapping: mapping,
    items,
    totalParsed: items.length,
    warnings,
  };
}

export interface YomiDeckExportPackage {
  format: 'yomi-deck-v1';
  version: number;
  exportedAt: string;
  deck: {
    name: string;
    languageCode: string;
  };
  cards: Array<{
    text: string;
    reading: string;
    meanings: string[];
    level?: string;
    selectedMeanings?: string[];
  }>;
}

/**
 * Serializa un mazo completo al formato nativo Yomi (.yomi / JSON estructurado).
 */
export function exportDeckToYomiFormat(
  deck: { name: string; languageCode: string },
  cards: Array<{
    simplified: string;
    displayReading?: string;
    meanings: string;
    resolvedLevel?: string;
    auxiliaryInfo?: string | null;
  }>
): string {
  const payload: YomiDeckExportPackage = {
    format: 'yomi-deck-v1',
    version: 1,
    exportedAt: new Date().toISOString(),
    deck: {
      name: deck.name,
      languageCode: deck.languageCode,
    },
    cards: cards.map((c) => {
      let meaningsArray: string[] = [];
      try {
        const parsed = JSON.parse(c.meanings);
        meaningsArray = Array.isArray(parsed) ? parsed : [String(c.meanings)];
      } catch {
        meaningsArray = [c.meanings];
      }

      const aux = parseAux(c.auxiliaryInfo);
      const auxSelected = aux.selectedMeanings;
      const selected: string[] | undefined = Array.isArray(auxSelected) ? auxSelected : undefined;

      return {
        text: c.simplified,
        reading: c.displayReading || '',
        meanings: meaningsArray,
        level: c.resolvedLevel || undefined,
        selectedMeanings: selected,
        media: aux.media,
      };
    }),
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Verifica si un texto corresponde al formato nativo de exportación Yomi.
 */
export function isYomiPackage(content: string): boolean {
  if (!content || !content.trim().startsWith('{')) return false;
  try {
    const obj = JSON.parse(content);
    return obj && obj.format === 'yomi-deck-v1';
  } catch {
    return false;
  }
}

export interface AnkiMediaManifest {
  byFile: Map<string, ZipEntry>;
  /** Formato nuevo de Anki: cada archivo de media viene comprimido con zstd dentro del zip. */
  zstd: boolean;
  audioCount: number;
  videoCount: number;
  imageCount: number;
  totalBytes: number;
  missing: string[];
  /** Archivos del diseño de los tipos de nota (CSS importado, imágenes de las plantillas) que vienen en el zip */
  designFiles: string[];
}

export interface AnkiPackageExtractResult {
  deckName: string;
  languageCode: string;
  deckType: 'language' | 'custom';
  /**
   * 'vocabulary': mazo de vocabulario con palabra, lectura y significado reconocibles, sin JavaScript ni media
   *   (Yomi corrige solo, con su propia tarjeta).
   * 'anki': cualquier otro; cada tarjeta se muestra con el diseño del mazo y el usuario decide cuándo vuelve.
   */
  mode: 'vocabulary' | 'anki';
  /** Mazos de vocabulario: qué se responde en el repaso (lectura o significado), según el frente del mazo */
  answerMode?: AnswerMode;
  items: ParsedVocabularyItem[];
  totalNotes: number;
  /** Tipos de nota que usan las notas (plantillas, CSS y campos), por id */
  noteTypes: Record<string, AnkiNoteType>;
  mediaManifest?: AnkiMediaManifest;
}

/**
 * Abre la base de la colección. Primero en memoria (deserialize); si el binario no lo soporta,
 * la escribe en la carpeta de SQLite y la abre desde ahí. `cleanup` borra esa copia.
 */
async function openCollectionDb(
  bytes: Uint8Array
): Promise<{ db: SQLite.SQLiteDatabase; cleanup: () => Promise<void> }> {
  try {
    return { db: await SQLite.deserializeDatabaseAsync(bytes), cleanup: async () => {} };
  } catch {
    const tempDbName = `temp_anki_${Date.now()}.db`;
    const targetDir = SQLite.defaultDatabaseDirectory || `${FileSystem.documentDirectory}SQLite/`;
    const dirInfo = await FileSystem.getInfoAsync(targetDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
    }
    const tempFile = new File(`${targetDir}${tempDbName}`);
    if (tempFile.exists) tempFile.delete();
    tempFile.write(bytes);
    return {
      db: await SQLite.openDatabaseAsync(tempDbName),
      cleanup: () => SQLite.deleteDatabaseAsync(tempDbName).catch(() => {}),
    };
  }
}

/**
 * Tipos de nota (campos, plantillas, CSS) y nombre de cada mazo. El esquema nuevo de Anki (v18) los guarda
 * en las tablas `notetypes`, `fields`, `templates` y `decks`; el clásico, como JSON en `col.models` / `col.decks`.
 */
async function readCollectionSchema(
  db: SQLite.SQLiteDatabase
): Promise<{ noteTypes: Map<number, AnkiNoteType>; deckNames: Map<number, string> }> {
  const noteTypes = new Map<number, AnkiNoteType>();
  const deckNames = new Map<number, string>();

  const hasFieldsTable = await db.getFirstAsync(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'fields'"
  );
  if (hasFieldsTable) {
    const types = await db.getAllAsync<{ id: number; name: string; config: Uint8Array }>(
      'SELECT id, name, config FROM notetypes'
    );
    for (const t of types) {
      const { kind, css } = decodeNotetypeConfig(t.config);
      noteTypes.set(Number(t.id), { name: t.name, kind, css, fieldNames: [], templates: [] });
    }
    const fields = await db.getAllAsync<{ ntid: number; ord: number; name: string }>(
      'SELECT ntid, ord, name FROM fields ORDER BY ntid, ord'
    );
    for (const f of fields) {
      const type = noteTypes.get(Number(f.ntid));
      if (type) type.fieldNames[f.ord] = f.name;
    }
    const templates = await db.getAllAsync<{ ntid: number; ord: number; name: string; config: Uint8Array }>(
      'SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord'
    );
    for (const tpl of templates) {
      const type = noteTypes.get(Number(tpl.ntid));
      if (type) type.templates[tpl.ord] = { name: tpl.name, ...decodeTemplateConfig(tpl.config) };
    }
    // Los mazos anidados se guardan como "Padre\x1fHijo"
    const decks = await db.getAllAsync<{ id: number; name: string }>('SELECT id, name FROM decks');
    for (const d of decks) deckNames.set(Number(d.id), d.name.split('\x1f').join('::'));
  } else {
    const col = await db.getFirstAsync<{ decks: string; models: string }>('SELECT decks, models FROM col LIMIT 1');
    if (!col) throw new Error('La base de datos de Anki no contiene información de colección.');
    for (const m of Object.values(JSON.parse(col.models || '{}')) as any[]) {
      const templates = (Array.isArray(m.tmpls) ? [...m.tmpls] : [])
        .sort((a: any, b: any) => a.ord - b.ord)
        .map((t: any) => ({ name: String(t.name || ''), qfmt: String(t.qfmt || ''), afmt: String(t.afmt || '') }));
      noteTypes.set(Number(m.id), {
        name: String(m.name || ''),
        kind: m.type === 1 ? 1 : 0,
        css: String(m.css || ''),
        fieldNames: Array.isArray(m.flds) ? m.flds.map((f: any) => String(f.name || '')) : [],
        templates,
      });
    }
    for (const d of Object.values(JSON.parse(col.decks || '{}')) as any[]) {
      deckNames.set(Number(d.id), String(d.name || ''));
    }
  }
  return { noteTypes, deckNames };
}

/**
 * Descomprime un paquete nativo de Anki (.apkg) por bloques utilizando FileHandle,
 * abre su base de datos interna y extrae notas junto con su manifiesto de media.
 * Soporta el formato clásico (collection.anki2 / .anki21) y el nuevo de Anki 2.1.50+
 * (collection.anki21b, todo comprimido con zstd), sin pedirle al usuario que exporte de otra forma.
 *
 * @param preferredLanguage idioma del usuario ("es", "en"…), para elegir el campo de significado
 *   cuando el mazo trae varios (p. ej. VocabDef / VocabDefEsp).
 */
export async function extractAnkiPackageAsync(
  fileUri: string,
  preferredLanguage?: string
): Promise<AnkiPackageExtractResult> {
  const reader = openZip(fileUri);
  let collection: { db: SQLite.SQLiteDatabase; cleanup: () => Promise<void> } | null = null;

  try {
    // El collection.anki2 que acompaña a los formatos nuevos es sólo una nota de relleno
    const dbEntry =
      reader.getEntry('collection.anki21b') || reader.getEntry('collection.anki21') || reader.getEntry('collection.anki2');
    if (!dbEntry) {
      throw new Error('El archivo .apkg no contiene una base de datos válida de Anki (collection.anki2).');
    }

    let dbBytes = reader.readEntry(dbEntry);
    const isNewFormat = isZstd(dbBytes);
    if (isNewFormat) dbBytes = decompressZstd(dbBytes);
    collection = await openCollectionDb(prepareAnkiCollection(dbBytes));
    const db = collection.db;

    const { noteTypes, deckNames } = await readCollectionSchema(db);

    // El mazo con más tarjetas (en mazos anidados, el padre suele estar vacío)
    const topDeck = await db.getFirstAsync<{ did: number }>(
      'SELECT did, count(*) AS n FROM cards GROUP BY did ORDER BY n DESC LIMIT 1'
    );
    const deckName =
      (topDeck && deckNames.get(Number(topDeck.did))) ||
      Array.from(deckNames.values()).find((name) => name && name !== 'Default') ||
      'Mazo Anki';

    const noteRows = await db.getAllAsync<{ id: number; mid: number; flds: string; tags: string }>(
      'SELECT id, mid, flds, tags FROM notes'
    );
    const notes: AnkiNote[] = noteRows.map((n) => ({ id: Number(n.id), mid: Number(n.mid), flds: n.flds, tags: n.tags }));
    // Las tarjetas que existen (Anki ya resolvió qué plantillas generan tarjeta para cada nota)
    const cardRows = await db.getAllAsync<{ nid: number; ord: number }>('SELECT nid, ord FROM cards ORDER BY nid, ord');
    const cards: AnkiCard[] = cardRows.map((c) => ({ noteId: Number(c.nid), ord: Number(c.ord) }));

    // Tipos de nota que se usan, y los archivos que pide su diseño (fuentes, CSS importado…)
    const usedTypes: Record<string, AnkiNoteType> = {};
    for (const note of notes) {
      const type = noteTypes.get(note.mid);
      if (type) usedTypes[String(note.mid)] = type;
    }

    // Un diseño con JavaScript propio arma su propia dinámica de estudio: va a un mazo personalizado
    // con su diseño, aunque tenga palabra, lectura y significado (la tarjeta de Yomi y la del mazo a la vez
    // no se entienden)
    const hasOwnLogic = Object.values(usedTypes).some((type) =>
      type.templates.some((template) => /<script\b/i.test(template.qfmt + template.afmt))
    );
    const fieldNamesByModel = new Map([...noteTypes].map(([id, t]) => [id, t.fieldNames]));
    const parsed = parseAnkiNotes(notes, fieldNamesByModel, deckName, preferredLanguage);
    // Un mazo de idioma es solo la estructura de Yomi (su tarjeta, su voz): si el mazo trae media (audios,
    // imágenes, videos) va a personalizado, donde se ve con su diseño
    const hasMedia = parsed.referencedMedia.size > 0;
    const mode: AnkiPackageExtractResult['mode'] =
      parsed.vocabularyDetected && !hasOwnLogic && !hasMedia ? 'vocabulary' : 'anki';
    const { items, referencedMedia } =
      mode === 'vocabulary' ? parsed : buildAnkiCardItems(cards, notes, noteTypes, deckName);

    // Mazo de vocabulario: qué se responde, según lo que muestra el frente de su tarjeta más usada
    let answerMode: AnswerMode | undefined;
    if (mode === 'vocabulary') {
      const notesPerModel = new Map<number, number>();
      for (const note of notes) notesPerModel.set(note.mid, (notesPerModel.get(note.mid) ?? 0) + 1);
      const mainModel = [...notesPerModel.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const mainType = mainModel !== undefined ? noteTypes.get(mainModel) : undefined;
      if (mainType) {
        const mainNoteIds = new Set(notes.filter((n) => n.mid === mainModel).map((n) => n.id));
        const cardsPerOrd = new Map<number, number>();
        for (const c of cards) if (mainNoteIds.has(c.noteId)) cardsPerOrd.set(c.ord, (cardsPerOrd.get(c.ord) ?? 0) + 1);
        const mainOrd = [...cardsPerOrd.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
        answerMode = detectAnswerMode(
          mainType.templates[mainOrd]?.qfmt ?? mainType.templates[0]?.qfmt ?? '',
          mainType.fieldNames,
          buildFieldPlan(mainType.fieldNames, preferredLanguage),
          notes.filter((n) => n.mid === mainModel).map((n) => n.flds.split('\x1f')),
          parsed.languageCode
        );
      }
    }

    const designFiles = new Set(Object.values(usedTypes).flatMap(noteTypeMediaFiles));

    // Índice de media: nombre real -> entrada del zip
    let mediaIndex = new Map<string, string>();
    const mediaEntry = reader.getEntry('media');
    if (mediaEntry) {
      try {
        mediaIndex = decodeMediaIndex(reader.readEntry(mediaEntry));
      } catch (e) {
        console.warn('[AnkiImporter] Error al leer el índice de media:', e);
      }
    }
    const findEntry = (fileName: string) =>
      reader.getEntry(mediaIndex.get(fileName) || mediaIndex.get(fileName.toLowerCase()) || fileName);

    const byFile = new Map<string, ZipEntry>();
    const missing: string[] = [];
    const counts: Record<MediaKind, number> = { audio: 0, video: 0, image: 0 };
    let totalBytes = 0;
    for (const [fileName, kind] of referencedMedia) {
      const entry = findEntry(fileName);
      if (entry) {
        byFile.set(fileName, entry);
        counts[kind]++;
        totalBytes += entry.size;
      } else {
        missing.push(fileName);
      }
    }
    const designFilesInZip: string[] = [];
    for (const fileName of designFiles) {
      const entry = findEntry(fileName);
      if (!entry) continue;
      designFilesInZip.push(fileName);
      if (!byFile.has(fileName)) {
        byFile.set(fileName, entry);
        totalBytes += entry.size;
      }
    }

    return {
      deckName,
      languageCode: parsed.languageCode,
      deckType: mode === 'vocabulary' ? 'language' : 'custom',
      mode,
      answerMode,
      items,
      totalNotes: items.length,
      noteTypes: usedTypes,
      mediaManifest: {
        byFile,
        zstd: isNewFormat,
        audioCount: counts.audio,
        videoCount: counts.video,
        imageCount: counts.image,
        totalBytes,
        missing,
        designFiles: designFilesInZip,
      },
    };
  } finally {
    reader.close();
    if (collection) {
      await collection.db.closeAsync().catch(() => {});
      await collection.cleanup();
    }
  }
}

/** Espacio libre mínimo para empezar a extraer media. */
const MIN_FREE_BYTES = 50 * 1024 * 1024;

/** "neko.mp3" + "a1b2c3d4…" -> "neko-a1b2c3d4.mp3" */
function withHashSuffix(fileName: string, md5: string | null): string {
  const hash8 = (md5 || String(Date.now())).slice(0, 8);
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? `${fileName.slice(0, dot)}-${hash8}${fileName.slice(dot)}` : `${fileName}-${hash8}`;
}

/**
 * Extrae archivos multimedia de un paquete .apkg hacia el almacenamiento local (Paths.document/media),
 * deduplicando por contenido (MD5) y reportando el progreso periódicamente.
 *
 * Cada archivo se extrae primero a la caché y después:
 * - si el destino no existe, se mueve ahí;
 * - si existe con el mismo contenido, se reutiliza;
 * - si existe con otro contenido, se guarda como `nombre-<md5>.ext` (siempre el mismo nombre para el mismo archivo).
 *
 * `preferredPaths` (al recuperar) indica la ruta que ya tiene guardada cada palabra, para escribir exactamente ahí.
 */
export async function importAnkiMediaAsync(
  fileUri: string,
  filesToExtract: string[],
  manifest: AnkiMediaManifest,
  onProgress?: (done: number, total: number) => void,
  preferredPaths?: Map<string, string>
): Promise<{ paths: Map<string, string>; written: number; reused: number; failed: string[] }> {
  let freeBytes = 0;
  try {
    freeBytes = Paths.availableDiskSpace;
  } catch {}
  if (freeBytes > 0 && freeBytes < MIN_FREE_BYTES) {
    throw new Error('Espacio de almacenamiento insuficiente en el dispositivo.');
  }

  const mediaDir = getMediaDir();
  const paths = new Map<string, string>();
  const failed: string[] = [];
  let written = 0;
  let reused = 0;

  const reader = openZip(fileUri);
  try {
    const total = filesToExtract.length;
    for (let i = 0; i < total; i++) {
      const fileName = filesToExtract[i];
      const entry = manifest.byFile.get(fileName);
      const preferredPath = preferredPaths?.get(fileName);
      const targetName = preferredPath ? mediaFileName(preferredPath) : sanitizeMediaName(fileName);
      const temp = new File(Paths.cache, `media_import_${Date.now()}_${i}`);
      const tempUri = temp.uri; // moveSync actualiza temp.uri al destino

      try {
        if (!entry) throw new Error('No está en el paquete');
        reader.extractEntryToFile(entry, temp, { zstd: manifest.zstd });

        const dest = new File(mediaDir, targetName);
        if (!dest.exists) {
          temp.moveSync(dest);
          paths.set(fileName, mediaPath(targetName));
          written++;
        } else if (dest.md5 && temp.md5 && dest.md5.toLowerCase() === temp.md5.toLowerCase()) {
          temp.delete();
          paths.set(fileName, mediaPath(targetName));
          reused++;
        } else {
          const uniqueName = withHashSuffix(targetName, temp.md5);
          temp.moveSync(new File(mediaDir, uniqueName), { overwrite: true });
          paths.set(fileName, mediaPath(uniqueName));
          written++;
        }
      } catch (err) {
        console.warn(`[AnkiImporter] Error al extraer media ${fileName}:`, err);
        deleteFileQuietly(tempUri);
        failed.push(fileName);
      }

      if ((i + 1) % 20 === 0 || i === total - 1) {
        onProgress?.(i + 1, total);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
  } finally {
    reader.close();
    invalidateMediaFilesCache();
  }

  return { paths, written, reused, failed };
}
