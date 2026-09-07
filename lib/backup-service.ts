import { db } from '../db';
import { decks, words, sentences, sentenceWords, srsItems } from '../db/schema';
import { eq } from 'drizzle-orm';
import * as FileSystem from 'expo-file-system/legacy';
import { Share, Platform } from 'react-native';
import { getStorageItem, setStorageItem } from './storage-service';

export const BACKUP_STORAGE_KEY = 'yomi_last_backup_timestamp';

export interface YomiDeckBackupItem {
  id: string;
  languageCode: string;
  name: string;
  createdAt: string;
}

export interface YomiWordBackupItem {
  id: string;
  deckId: string;
  simplified: string;
  traditional: string;
  pinyinDisplay: string;
  pinyinNumeric: string;
  meanings: string;
  auxiliaryInfo: string | null;
  createdAt: string;
}

export interface YomiSentenceBackupItem {
  id: string;
  deckId: string;
  textContent: string;
  readingContent: string;
  translation: string;
  createdAt: string;
}

export interface YomiSentenceWordBackupItem {
  sentenceId: string;
  wordId: string;
}

export interface YomiSrsBackupItem {
  id: string;
  itemType: string;
  itemId: string;
  displayText: string;
  displayReading: string;
  displayMeaning: string;
  state: number;
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReview: string | null;
  createdAt: string;
}

export interface YomiFullBackupPackage {
  format: 'yomi-full-backup-v1';
  version: 1;
  createdAt: string;
  metadata: {
    appVersion: string;
    decksCount: number;
    wordsCount: number;
    sentencesCount: number;
    srsCount: number;
  };
  data: {
    decks: YomiDeckBackupItem[];
    words: YomiWordBackupItem[];
    sentences: YomiSentenceBackupItem[];
    sentenceWords: YomiSentenceWordBackupItem[];
    srsItems: YomiSrsBackupItem[];
  };
}

/**
 * Serializa toda la base de datos del usuario en un paquete autocontenido de respaldo.
 */
export async function createFullBackupPackage(): Promise<YomiFullBackupPackage> {
  const allDecks = await db.select().from(decks);
  const allWords = await db.select().from(words);
  const allSentences = await db.select().from(sentences);
  const allSentenceWords = await db.select().from(sentenceWords);
  const allSrsItems = await db.select().from(srsItems);

  const serializedDecks: YomiDeckBackupItem[] = allDecks.map((d) => ({
    id: d.id,
    languageCode: d.languageCode,
    name: d.name,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : new Date(d.createdAt).toISOString(),
  }));

  const serializedWords: YomiWordBackupItem[] = allWords.map((w) => ({
    id: w.id,
    deckId: w.deckId,
    simplified: w.simplified,
    traditional: w.traditional,
    pinyinDisplay: w.pinyinDisplay,
    pinyinNumeric: w.pinyinNumeric,
    meanings: w.meanings,
    auxiliaryInfo: w.auxiliaryInfo,
    createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : new Date(w.createdAt).toISOString(),
  }));

  const serializedSentences: YomiSentenceBackupItem[] = allSentences.map((s) => ({
    id: s.id,
    deckId: s.deckId,
    textContent: s.textContent,
    readingContent: s.readingContent,
    translation: s.translation,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : new Date(s.createdAt).toISOString(),
  }));

  const serializedSentenceWords: YomiSentenceWordBackupItem[] = allSentenceWords.map((sw) => ({
    sentenceId: sw.sentenceId,
    wordId: sw.wordId,
  }));

  const serializedSrs: YomiSrsBackupItem[] = allSrsItems.map((s) => ({
    id: s.id,
    itemType: s.itemType,
    itemId: s.itemId,
    displayText: s.displayText,
    displayReading: s.displayReading,
    displayMeaning: s.displayMeaning,
    state: s.state,
    due: s.due instanceof Date ? s.due.toISOString() : new Date(s.due).toISOString(),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsedDays: s.elapsedDays,
    scheduledDays: s.scheduledDays,
    reps: s.reps,
    lapses: s.lapses,
    lastReview: s.lastReview
      ? s.lastReview instanceof Date
        ? s.lastReview.toISOString()
        : new Date(s.lastReview).toISOString()
      : null,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : new Date(s.createdAt).toISOString(),
  }));

  return {
    format: 'yomi-full-backup-v1',
    version: 1,
    createdAt: new Date().toISOString(),
    metadata: {
      appVersion: '1.0.0',
      decksCount: serializedDecks.length,
      wordsCount: serializedWords.length,
      sentencesCount: serializedSentences.length,
      srsCount: serializedSrs.length,
    },
    data: {
      decks: serializedDecks,
      words: serializedWords,
      sentences: serializedSentences,
      sentenceWords: serializedSentenceWords,
      srsItems: serializedSrs,
    },
  };
}

/**
 * Exporta la copia de seguridad completa a través del menú nativo del sistema
 * (permite guardar en Google Drive, enviar por mensajería o guardar en archivos).
 */
export async function exportFullBackup(): Promise<{ success: boolean; stats: YomiFullBackupPackage['metadata'] }> {
  const pkg = await createFullBackupPackage();
  const json = JSON.stringify(pkg, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `yomi-backup-${dateStr}.yomi`;

  if (Platform.OS !== 'web' && FileSystem.cacheDirectory) {
    try {
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, json, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (e) {
      console.warn('Advertencia al escribir archivo temporal de backup:', e);
    }
  }

  await Share.share({
    title: fileName,
    message: json,
  });

  await setStorageItem(BACKUP_STORAGE_KEY, new Date().toISOString());

  return { success: true, stats: pkg.metadata };
}

/**
 * Analiza y valida el contenido de un archivo de copia de seguridad.
 */
export function parseBackupFile(content: string): YomiFullBackupPackage {
  if (!content || typeof content !== 'string') {
    throw new Error('El archivo está vacío o no contiene texto legible.');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('El archivo seleccionado no tiene una estructura JSON válida.');
  }

  if (!parsed || parsed.format !== 'yomi-full-backup-v1' || !parsed.data) {
    throw new Error('El archivo seleccionado no corresponde a una copia de seguridad válida de Yomi.');
  }

  if (!Array.isArray(parsed.data.decks) || !Array.isArray(parsed.data.words)) {
    throw new Error('La estructura interna de la copia está incompleta o dañada.');
  }

  return parsed as YomiFullBackupPackage;
}

/**
 * Restaura los datos del paquete de respaldo en SQLite manteniendo intactas las tarjetas SRS y sus progresos FSRS.
 */
export async function restoreBackupPackage(
  pkg: YomiFullBackupPackage,
  mode: 'replace' | 'merge' = 'replace'
): Promise<{ decksCount: number; wordsCount: number; srsCount: number }> {
  if (mode === 'replace') {
    // Limpieza de datos en cascada
    await db.delete(sentenceWords);
    await db.delete(sentences);
    await db.delete(srsItems);
    await db.delete(words);
    await db.delete(decks);
  }

  // 1. Restaurar Decks
  for (const d of pkg.data.decks) {
    if (mode === 'merge') {
      const existing = await db.select().from(decks).where(eq(decks.id, d.id)).limit(1);
      if (existing.length > 0) continue;
    }
    await db.insert(decks).values({
      id: d.id,
      languageCode: d.languageCode,
      name: d.name,
      createdAt: new Date(d.createdAt),
    });
  }

  // 2. Restaurar Words
  for (const w of pkg.data.words) {
    if (mode === 'merge') {
      const existing = await db.select().from(words).where(eq(words.id, w.id)).limit(1);
      if (existing.length > 0) continue;
    }
    await db.insert(words).values({
      id: w.id,
      deckId: w.deckId,
      simplified: w.simplified,
      traditional: w.traditional,
      pinyinDisplay: w.pinyinDisplay,
      pinyinNumeric: w.pinyinNumeric,
      meanings: w.meanings,
      auxiliaryInfo: w.auxiliaryInfo,
      createdAt: new Date(w.createdAt),
    });
  }

  // 3. Restaurar Sentences
  if (Array.isArray(pkg.data.sentences)) {
    for (const s of pkg.data.sentences) {
      if (mode === 'merge') {
        const existing = await db.select().from(sentences).where(eq(sentences.id, s.id)).limit(1);
        if (existing.length > 0) continue;
      }
      await db.insert(sentences).values({
        id: s.id,
        deckId: s.deckId,
        textContent: s.textContent,
        readingContent: s.readingContent,
        translation: s.translation,
        createdAt: new Date(s.createdAt),
      });
    }
  }

  // 4. Restaurar SentenceWords
  if (Array.isArray(pkg.data.sentenceWords)) {
    for (const sw of pkg.data.sentenceWords) {
      try {
        await db.insert(sentenceWords).values({
          sentenceId: sw.sentenceId,
          wordId: sw.wordId,
        });
      } catch {}
    }
  }

  // 5. Restaurar SrsItems (FSRS intacto)
  if (Array.isArray(pkg.data.srsItems)) {
    for (const item of pkg.data.srsItems) {
      if (mode === 'merge') {
        const existing = await db.select().from(srsItems).where(eq(srsItems.id, item.id)).limit(1);
        if (existing.length > 0) continue;
      }
      await db.insert(srsItems).values({
        id: item.id,
        itemType: item.itemType,
        itemId: item.itemId,
        displayText: item.displayText,
        displayReading: item.displayReading,
        displayMeaning: item.displayMeaning,
        state: item.state,
        due: new Date(item.due),
        stability: item.stability,
        difficulty: item.difficulty,
        elapsedDays: item.elapsedDays,
        scheduledDays: item.scheduledDays,
        reps: item.reps,
        lapses: item.lapses,
        lastReview: item.lastReview ? new Date(item.lastReview) : null,
        createdAt: new Date(item.createdAt),
      });
    }
  }

  return {
    decksCount: pkg.data.decks.length,
    wordsCount: pkg.data.words.length,
    srsCount: (pkg.data.srsItems || []).length,
  };
}

/**
 * Consulta la fecha ISO del último respaldo guardado en el dispositivo.
 */
export async function getLastBackupDate(): Promise<string | null> {
  return await getStorageItem(BACKUP_STORAGE_KEY);
}
