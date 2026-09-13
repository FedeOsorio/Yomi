import { db } from '../db';
import { decks, words, sentences, sentenceWords, srsItems } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Share, Platform } from 'react-native';
import { getStorageItem, setStorageItem } from './storage-service';
import { createNewSrsItem } from './srs-engine';

export const BACKUP_STORAGE_KEY = 'yomi_last_backup_timestamp';

type DataChangeListener = () => void;
const dataChangeListeners = new Set<DataChangeListener>();

export function onDataChanged(callback: DataChangeListener) {
  dataChangeListeners.add(callback);
  return () => {
    dataChangeListeners.delete(callback);
  };
}

export function notifyDataChanged() {
  dataChangeListeners.forEach((cb) => {
    try {
      cb();
    } catch (e) {
      console.warn('Error in data change listener:', e);
    }
  });
}

export interface YomiDeckBackupItem {
  id: string;
  languageCode: string;
  name: string;
  type?: 'language' | 'custom';
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
    type: (d.type as 'language' | 'custom') || 'language',
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
 * Guarda la copia de seguridad directamente en una carpeta elegida por el usuario
 * en el teléfono (usando el explorador nativo de carpetas de Android / StorageAccessFramework).
 */
export async function exportToPhoneFolder(): Promise<{ success: boolean; cancelled?: boolean; stats: YomiFullBackupPackage['metadata'] }> {
  const pkg = await createFullBackupPackage();
  const json = JSON.stringify(pkg, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `yomi-backup-${dateStr}.yomi`;

  if (Platform.OS === 'android') {
    try {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) {
        return { success: false, cancelled: true, stats: pkg.metadata };
      }

      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        fileName,
        'application/octet-stream'
      );

      await FileSystem.writeAsStringAsync(fileUri, json, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      await setStorageItem(BACKUP_STORAGE_KEY, new Date().toISOString());
      return { success: true, stats: pkg.metadata };
    } catch (e: any) {
      console.error('Error al guardar en carpeta del teléfono:', e);
      throw new Error(e.message || 'No se pudo guardar el archivo en la carpeta seleccionada.');
    }
  }

  return await exportFullBackup();
}

/**
 * Exporta la copia de seguridad completa generando el archivo .yomi real
 * y abriendo el diálogo nativo del sistema para guardarlo en Descargas / Archivos o compartirlo.
 */
export async function exportFullBackup(): Promise<{ success: boolean; cancelled?: boolean; stats: YomiFullBackupPackage['metadata'] }> {
  const pkg = await createFullBackupPackage();
  const json = JSON.stringify(pkg, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `yomi-backup-${dateStr}.yomi`;

  if (FileSystem.cacheDirectory) {
    try {
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(filePath, json, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/octet-stream',
          dialogTitle: 'Guardar copia de seguridad de Yomi',
          UTI: 'public.data',
        });

        await setStorageItem(BACKUP_STORAGE_KEY, new Date().toISOString());
        return { success: true, stats: pkg.metadata };
      }
    } catch (e: any) {
      console.error('Error al compartir archivo de backup:', e);
      throw new Error(e.message || 'No se pudo generar la exportación.');
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

  let cleanContent = content.trim();
  // Quitar BOM si existe (común al guardar en Bloc de notas)
  if (cleanContent.charCodeAt(0) === 0xfeff) {
    cleanContent = cleanContent.slice(1).trim();
  }

  // Si viene envuelto en bloque markdown ```json ... ```
  if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  if (cleanContent.startsWith('PK\x03\x04') || cleanContent.startsWith('PK')) {
    throw new Error('El archivo seleccionado es un paquete binario de Anki (.apkg), no una copia de seguridad JSON de Yomi.');
  }

  // Normalizar comillas tipográficas / smart quotes de teclados móviles o WhatsApp
  cleanContent = cleanContent
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

  // Aislar el objeto JSON eliminando cualquier texto previo o posterior (como cabeceras de chat o prefijos)
  const firstBrace = cleanContent.indexOf('{');
  const lastBrace = cleanContent.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanContent = cleanContent.slice(firstBrace, lastBrace + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleanContent);
  } catch (err: any) {
    // Si hay llaves de cierre sobrantes al final, intentar recortar hacia atrás
    let trimmed = cleanContent;
    let recovered = false;
    while (trimmed.endsWith('}')) {
      trimmed = trimmed.slice(0, -1).trim();
      const prevBrace = trimmed.lastIndexOf('}');
      if (prevBrace !== -1) {
        trimmed = trimmed.slice(0, prevBrace + 1);
        try {
          parsed = JSON.parse(trimmed);
          recovered = true;
          break;
        } catch {}
      } else {
        break;
      }
    }

    if (!recovered) {
      console.error('[BackupParse] Error parsing JSON:', err.message, 'Snippet:', cleanContent.slice(0, 150));
      throw new Error('El archivo seleccionado no tiene una estructura JSON válida: ' + (err.message || ''));
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('El archivo seleccionado no corresponde a una copia de seguridad válida de Yomi.');
  }

  // Caso 1: Formato v1 estándar { format: 'yomi-full-backup-v1', data: { decks, words, ... } }
  if (parsed.data && Array.isArray(parsed.data.decks) && Array.isArray(parsed.data.words)) {
    return {
      format: 'yomi-full-backup-v1',
      version: 1,
      createdAt: parsed.createdAt || new Date().toISOString(),
      metadata: {
        appVersion: parsed.metadata?.appVersion || '1.0.0',
        decksCount: parsed.data.decks.length,
        wordsCount: parsed.data.words.length,
        sentencesCount: (parsed.data.sentences || []).length,
        srsCount: (parsed.data.srsItems || []).length,
      },
      data: {
        decks: parsed.data.decks,
        words: parsed.data.words,
        sentences: parsed.data.sentences || [],
        sentenceWords: parsed.data.sentenceWords || [],
        srsItems: parsed.data.srsItems || [],
      },
    };
  }

  // Caso 2: Formato legado o simplificado con decks y words en la raíz
  const decksList = Array.isArray(parsed.decks) ? parsed.decks : null;
  const wordsList = Array.isArray(parsed.words) ? parsed.words : null;

  if (decksList && wordsList) {
    const sentencesList = Array.isArray(parsed.sentences) ? parsed.sentences : [];
    const sentenceWordsList = Array.isArray(parsed.sentenceWords) ? parsed.sentenceWords : [];
    const srsList = Array.isArray(parsed.srsItems) ? parsed.srsItems : Array.isArray(parsed.srs) ? parsed.srs : [];

    return {
      format: 'yomi-full-backup-v1',
      version: 1,
      createdAt: parsed.createdAt || new Date().toISOString(),
      metadata: {
        appVersion: parsed.metadata?.appVersion || '1.0.0',
        decksCount: decksList.length,
        wordsCount: wordsList.length,
        sentencesCount: sentencesList.length,
        srsCount: srsList.length,
      },
      data: {
        decks: decksList,
        words: wordsList,
        sentences: sentencesList,
        sentenceWords: sentenceWordsList,
        srsItems: srsList,
      },
    };
  }

  throw new Error('El archivo no corresponde a una copia de seguridad de Yomi (no contiene mazos ni palabras reconocibles).');
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
    const deckType: 'language' | 'custom' = d.type || (d.languageCode === 'es-ES' ? 'custom' : 'language');
    if (mode === 'merge') {
      const existing = await db.select().from(decks).where(eq(decks.id, d.id)).limit(1);
      if (existing.length > 0) {
        // Asegurar que el tipo quede configurado correctamente (ej. 'custom' para medicina o es-ES)
        await db.update(decks).set({ type: deckType }).where(eq(decks.id, d.id));
        continue;
      }
    }
    await db.insert(decks).values({
      id: d.id,
      languageCode: d.languageCode,
      name: d.name,
      type: deckType,
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

  // 6. Garantizar que toda palabra tenga su tarjeta SRS (incluso si la copia vino con srsItems vacío)
  const allCurrentWords = await db.select().from(words);
  for (const w of allCurrentWords) {
    const existing = await db
      .select({ id: srsItems.id })
      .from(srsItems)
      .where(and(eq(srsItems.itemType, 'word'), eq(srsItems.itemId, w.id)))
      .limit(1);

    if (existing.length === 0) {
      let displayMeaning = w.meanings;
      try {
        const parsed = JSON.parse(w.meanings);
        if (Array.isArray(parsed)) {
          displayMeaning = parsed.join(', ');
        }
      } catch {}

      const newCard = createNewSrsItem('word', w.id, {
        displayText: w.simplified,
        displayReading: w.pinyinDisplay || w.pinyinNumeric || '',
        displayMeaning,
      });

      await db.insert(srsItems).values(newCard);
    }
  }

  const totalSrs = await db.select({ id: srsItems.id }).from(srsItems);

  // Notificar a todas las pantallas activas que los datos cambiaron para que se actualicen en vivo
  notifyDataChanged();

  return {
    decksCount: pkg.data.decks.length,
    wordsCount: pkg.data.words.length,
    srsCount: totalSrs.length,
  };
}

/**
 * Consulta la fecha ISO del último respaldo guardado en el dispositivo.
 */
export async function getLastBackupDate(): Promise<string | null> {
  return await getStorageItem(BACKUP_STORAGE_KEY);
}
