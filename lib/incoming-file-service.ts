import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { parseBackupFile, restoreBackupPackage, notifyDataChanged } from './backup-service';
import { extractAnkiPackageAsync } from './anki-importer';
import { createDeck } from './deck-service';
import { saveBatchWords } from './word-service';
import { t } from '../src/i18n';

let lastHandledUri = '';
let lastHandledTimestamp = 0;

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

  try {
    // 1. Siempre copiar primero la URI externa (ContentProvider de WhatsApp/Descargas) a la caché local
    const tempPath = `${FileSystem.cacheDirectory}incoming_${Date.now()}.bin`;
    try {
      await FileSystem.copyAsync({ from: uri, to: tempPath });
    } catch (copyErr) {
      console.warn('[IncomingFile] Falló copia inicial a caché, usando URI directa:', copyErr);
    }

    const fileInfo = await FileSystem.getInfoAsync(tempPath);
    const targetUri = fileInfo.exists ? tempPath : uri;

    // 2. Leer la cabecera en Base64 para detectar de forma 100% infalible si es ZIP (.apkg) o JSON (.yomi)
    const lowerUri = uri.toLowerCase();
    const isApkgName = lowerUri.includes('.apkg');

    let isZip = isApkgName;
    let base64Data = '';
    try {
      base64Data = await FileSystem.readAsStringAsync(targetUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Los archivos ZIP siempre comienzan con los bytes 0x50 0x4B (PK), que en Base64 es 'UEs'
      if (base64Data.startsWith('UEs') || base64Data.startsWith('PK')) {
        isZip = true;
      }
    } catch (readErr) {
      console.warn('[IncomingFile] Error al leer base64:', readErr);
    }

    if (isZip) {
      // Es un archivo .apkg de Anki
      const result = await extractAnkiPackageAsync(targetUri);
      FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});

      if (result.items.length === 0) {
        Alert.alert(t('incoming.emptyAnkiTitle'), t('incoming.emptyAnkiMsg'));
        return false;
      }

      Alert.alert(
        t('incoming.importAnkiTitle'),
        t('incoming.importAnkiMsg', { name: result.deckName, count: result.totalNotes }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('incoming.importAnkiBtn'),
            onPress: async () => {
              try {
                const deckId = await createDeck(result.deckName, result.languageCode, result.deckType);
                const { inserted, skipped } = await saveBatchWords(deckId, result.items);
                notifyDataChanged();
                const skippedMsg = skipped > 0 ? ` ${t('incoming.importSkippedMsg', { count: skipped })}` : '';
                Alert.alert(
                  t('incoming.importSuccessTitle'),
                  `${t('incoming.importSuccessMsg', { count: inserted, deck: result.deckName })}${skippedMsg}`,
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
