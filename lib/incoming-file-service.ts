import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import { File, FileMode } from 'expo-file-system';
// La API legacy sigue para copiar la URI externa: acepta los content:// de WhatsApp/Descargas
import * as FileSystem from 'expo-file-system/legacy';
import { parseBackupFile, restoreBackupPackage, notifyDataChanged } from './backup-service';
import { extractAnkiPackageAsync } from './anki-importer';
import { importAnkiDeckAsync } from './anki-import-service';
import { createDeck } from './deck-service';
import { getCurrentUserLanguage, t } from '../src/i18n';
import { useImportProgressStore } from '../src/stores/importProgressStore';

let lastHandledUri = '';
let lastHandledTimestamp = 0;

/** Nombre del .apkg según la URI recibida (si la trae), para pedírselo al usuario al recuperar la media. */
function apkgNameFromUri(uri: string, deckName: string): string {
  try {
    const lastSegment = decodeURIComponent(uri).split(/[/\\?#]/).pop() || '';
    if (lastSegment.toLowerCase().endsWith('.apkg')) return lastSegment;
  } catch {}
  return `${deckName || 'anki_deck'}.apkg`;
}

/**
 * Procesa un archivo recibido por intent desde WhatsApp, explorador de archivos o descargas.
 * Soporta tanto paquetes nativos de respaldo (.yomi) como paquetes de Anki (.apkg).
 */
export async function processIncomingBackupFile(uri: string): Promise<boolean> {
  const now = Date.now();
  // Evitar procesar dos veces el mismo evento dentro de 2 segundos
  if (!uri || (uri === lastHandledUri && now - lastHandledTimestamp < 2000)) return false;
  lastHandledUri = uri;
  lastHandledTimestamp = now;

  let tempPath = '';
  try {
    // 1. Siempre copiar primero la URI externa (ContentProvider de WhatsApp/Descargas) a la caché local
    tempPath = `${FileSystem.cacheDirectory}incoming_${Date.now()}.bin`;
    try {
      await FileSystem.copyAsync({ from: uri, to: tempPath });
    } catch (copyErr) {
      console.warn('[IncomingFile] Falló copia inicial a caché, usando URI directa:', copyErr);
    }

    const fileInfo = await FileSystem.getInfoAsync(tempPath);
    const targetUri = fileInfo.exists ? tempPath : uri;

    // 2. Leer los primeros 4 bytes mediante FileHandle sin cargar el archivo completo en memoria RAM
    const lowerUri = uri.toLowerCase();
    const isApkgName = lowerUri.includes('.apkg');
    let isZip = isApkgName;
    try {
      const testFile = new File(targetUri);
      if (testFile.exists && testFile.size >= 4) {
        const handle = testFile.open(FileMode.ReadOnly);
        const header = handle.readBytes(4);
        handle.close();
        if (header[0] === 0x50 && header[1] === 0x4b) {
          isZip = true;
        }
      }
    } catch (readErr) {
      console.warn('[IncomingFile] Error al verificar firma zip:', readErr);
    }

    if (isZip) {
      // Es un archivo .apkg de Anki
      const result = await extractAnkiPackageAsync(targetUri, getCurrentUserLanguage());

      if (result.items.length === 0) {
        FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
        Alert.alert(t('incoming.emptyAnkiTitle'), t('incoming.emptyAnkiMsg'));
        return false;
      }

      const mediaCount = (result.mediaManifest?.audioCount || 0) +
        (result.mediaManifest?.videoCount || 0) +
        (result.mediaManifest?.imageCount || 0);
      const mediaNote = mediaCount > 0 ? t('incoming.mediaCountNote', { count: mediaCount }) : '';

      Alert.alert(
        t('incoming.importAnkiTitle'),
        `${t('incoming.importAnkiMsg', { name: result.deckName, count: result.totalNotes })}${mediaNote}`,
        [
          {
            text: t('common.cancel'),
            style: 'cancel',
            onPress: () => {
              FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
            },
          },
          {
            text: t('incoming.importAnkiBtn'),
            onPress: async () => {
              const progress = useImportProgressStore.getState();
              progress.start(result.deckName, result.mediaManifest?.byFile.size ?? 0);
              try {
                const { deckId, inserted, skipped, mediaSaved, mediaFailed } = await importAnkiDeckAsync({
                  fileUri: targetUri,
                  fileName: apkgNameFromUri(uri, result.deckName),
                  items: result.items,
                  mode: result.mode,
                  noteTypes: result.noteTypes,
                  languageCode: result.languageCode,
                  manifest: result.mediaManifest,
                  getDeckId: () => createDeck(result.deckName, result.languageCode, result.deckType),
                  onProgress: progress.update,
                });
                progress.finish();

                notifyDataChanged();
                const skippedMsg = skipped > 0 ? ` ${t('incoming.importSkippedMsg', { count: skipped })}` : '';
                const mediaMsg =
                  (mediaSaved > 0 ? t('importDeck.mediaImportedCount', { count: mediaSaved }) : '') +
                  (mediaFailed > 0 ? t('importDeck.mediaSkippedCount', { count: mediaFailed }) : '');
                Alert.alert(
                  t('incoming.importSuccessTitle'),
                  `${t('incoming.importSuccessMsg', { count: inserted, deck: result.deckName })}${skippedMsg}${mediaMsg}`,
                  [
                    {
                      text: t('incoming.viewDeckBtn'),
                      onPress: () => {
                        router.push(`/deck/${deckId}`);
                      },
                    },
                  ]
                );
              } catch (err: any) {
                Alert.alert(t('incoming.importAnkiErrorTitle'), err?.message || t('incoming.importAnkiErrorMsg'));
              } finally {
                progress.finish();
                FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
              }
            },
          },
        ]
      );
      return true;
    }

    // 3. Si no es .apkg, procesar como paquete de respaldo nativo de Yomi (.yomi / JSON)
    let fileContent = '';
    try {
      fileContent = await FileSystem.readAsStringAsync(targetUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (readUtfErr) {
      console.warn('[IncomingFile] Falló lectura UTF8:', readUtfErr);
    } finally {
      FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
    }

    console.log('[IncomingFile] File read successfully, length:', fileContent.length);
    const pkg = parseBackupFile(fileContent);

    const foldersBullet = pkg.metadata.foldersCount
      ? `• ${pkg.metadata.foldersCount} ${pkg.metadata.foldersCount === 1 ? t('profile.folderSingular') : t('profile.folderPlural')}\n`
      : '';
    Alert.alert(
      t('incoming.yomiBackupTitle'),
      t('incoming.yomiBackupMsg', {
        folders: foldersBullet,
        decks: pkg.metadata.decksCount,
        words: pkg.metadata.wordsCount,
        srs: pkg.metadata.srsCount,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.merge'),
          onPress: async () => {
            try {
              const stats = await restoreBackupPackage(pkg, 'merge');
              const foldersText = stats.foldersCount
                ? `${stats.foldersCount} ${stats.foldersCount === 1 ? t('profile.folderSingular') : t('profile.folderPlural')}, `
                : '';
              Alert.alert(
                t('incoming.importSuccessTitle'),
                t('incoming.mergeSuccessMsg', {
                  folders: foldersText,
                  decks: stats.decksCount,
                  words: stats.wordsCount,
                  srs: stats.srsCount,
                })
              );
            } catch (err: any) {
              Alert.alert(t('incoming.mergeErrorTitle'), err.message || t('incoming.mergeErrorMsg'));
            }
          },
        },
        {
          text: t('profile.replaceAll'),
          style: 'destructive',
          onPress: async () => {
            try {
              const stats = await restoreBackupPackage(pkg, 'replace');
              const foldersText = stats.foldersCount
                ? `${stats.foldersCount} ${stats.foldersCount === 1 ? t('profile.folderSingular') : t('profile.folderPlural')}, `
                : '';
              Alert.alert(
                t('profile.restoreSuccessTitle'),
                t('incoming.replaceSuccessMsg', {
                  folders: foldersText,
                  decks: stats.decksCount,
                  words: stats.wordsCount,
                  srs: stats.srsCount,
                })
              );
            } catch (err: any) {
              Alert.alert(t('incoming.replaceErrorTitle'), err.message || t('incoming.replaceErrorMsg'));
            }
          },
        },
      ]
    );
    return true;
  } catch (err: any) {
    if (tempPath) {
      FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
    }
    // Si no es un archivo válido o está dañado
    Alert.alert(
      t('incoming.unsupportedFileTitle'),
      err?.message || t('incoming.unsupportedFileMsg')
    );
    return false;
  }
}

/**
 * Hook global que escucha la apertura de archivos externos en Yomi.
 */
export function useIncomingFileHandler() {
  useEffect(() => {
    // 1. Revisar si la app se abrió desde un archivo estando cerrada
    Linking.getInitialURL().then((url) => {
      if (url && (url.startsWith('content://') || url.startsWith('file://'))) {
        processIncomingBackupFile(url);
      }
    });

    // 2. Escuchar si se abre un archivo mientras la app ya está en memoria
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url && (url.startsWith('content://') || url.startsWith('file://'))) {
        processIncomingBackupFile(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
}
