import { useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { parseBackupFile, restoreBackupPackage } from './backup-service';

let lastHandledUri = '';
let lastHandledTimestamp = 0;

/**
 * Procesa un archivo recibido por intent desde WhatsApp, explorador de archivos o descargas.
 */
export async function processIncomingBackupFile(uri: string): Promise<boolean> {
  const now = Date.now();
  // Evitar procesar dos veces el mismo evento dentro de 2 segundos
  if (!uri || (uri === lastHandledUri && now - lastHandledTimestamp < 2000)) return false;
  lastHandledUri = uri;
  lastHandledTimestamp = now;

  try {
    // Leer el archivo desde la URI de contenido o archivo
    let fileContent = '';
    try {
      fileContent = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (readErr) {
      console.warn('Fallo lectura directa de URI, intentando copia local:', readErr);
      const tempPath = `${FileSystem.cacheDirectory}incoming_${Date.now()}.yomi`;
      await FileSystem.copyAsync({
        from: uri,
        to: tempPath,
      });
      fileContent = await FileSystem.readAsStringAsync(tempPath, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
    }

    console.log('[IncomingFile] File read successfully, length:', fileContent.length);
    // Intentar analizarlo como un paquete de copia de seguridad de Yomi
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
    // Si no es un archivo .yomi válido o está dañado
    Alert.alert(
      'Archivo no compatible',
      err?.message || 'El archivo recibido no es una copia de seguridad válida de Yomi o está dañado.'
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
