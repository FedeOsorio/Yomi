import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { parseBackupFile, restoreBackupPackage, notifyDataChanged } from './backup-service';
import { extractAnkiPackageAsync } from './anki-importer';
import { createDeck } from './deck-service';
import { saveBatchWords } from './word-service';

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
        Alert.alert('Mazo de Anki vacío', 'El archivo .apkg no contiene notas válidas para importar.');
        return false;
      }

      Alert.alert(
        'Importar Mazo de Anki',
        `Se recibió el mazo "${result.deckName}" con ${result.totalNotes} tarjetas.\n\n¿Deseás importarlo a tu colección?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Importar Mazo',
            onPress: async () => {
              try {
                const deckId = await createDeck(result.deckName, result.languageCode, result.deckType);
                const { inserted, skipped } = await saveBatchWords(deckId, result.items);
                notifyDataChanged();
                Alert.alert(
                  '¡Importación Exitosa!',
                  `Se importaron ${inserted} palabras al mazo "${result.deckName}".${
                    skipped > 0 ? ` (${skipped} repetidas omitidas)` : ''
                  }`,
                  [
                    {
                      text: 'Ver Mazo',
                      onPress: () => {
                        router.push(`/deck/${deckId}`);
                      },
                    },
                  ]
                );
              } catch (err: any) {
                Alert.alert('Error al importar mazo', err?.message || 'No se pudo guardar el mazo.');
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

    Alert.alert(
      'Copia de seguridad de Yomi',
      `Se recibió un paquete de respaldo con:\n• ${pkg.metadata.decksCount} mazos\n• ${pkg.metadata.wordsCount} palabras\n• ${pkg.metadata.srsCount} tarjetas SRS\n\n¿Cómo deseás importarlo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Combinar',
          onPress: async () => {
            try {
              const stats = await restoreBackupPackage(pkg, 'merge');
              Alert.alert(
                'Importación Exitosa',
                `Se combinaron ${stats.decksCount} mazos, ${stats.wordsCount} palabras y ${stats.srsCount} tarjetas SRS en tu colección.`
              );
            } catch (err: any) {
              Alert.alert('Error al importar', err.message || 'No se pudo combinar la copia.');
            }
          },
        },
        {
          text: 'Reemplazar Todo',
          style: 'destructive',
          onPress: async () => {
            try {
              const stats = await restoreBackupPackage(pkg, 'replace');
              Alert.alert(
                'Restauración Exitosa',
                `Se restauraron ${stats.decksCount} mazos, ${stats.wordsCount} palabras y ${stats.srsCount} tarjetas SRS.`
              );
            } catch (err: any) {
              Alert.alert('Error al restaurar', err.message || 'No se pudo restaurar la copia.');
            }
          },
        },
      ]
    );
    return true;
  } catch (err: any) {
    // Si no es un archivo válido o está dañado
    Alert.alert(
      'Archivo no compatible',
      err?.message || 'El archivo recibido no es una copia de seguridad válida de Yomi ni un paquete de Anki compatible.'
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
