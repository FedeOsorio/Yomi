import { Platform } from 'react-native';
import SpInAppUpdates, {
  IAUUpdateKind,
  StartUpdateOptions,
} from 'sp-react-native-in-app-updates';

let inAppUpdatesInstance: SpInAppUpdates | null = null;

function getInAppUpdates(): SpInAppUpdates {
  if (!inAppUpdatesInstance) {
    inAppUpdatesInstance = new SpInAppUpdates(false);
  }
  return inAppUpdatesInstance;
}

/**
 * Consulta a Google Play si hay una actualización disponible para Yomi.
 * Si existe, lanza el flujo inmediato de Google Play (diálogo oficial donde el usuario
 * puede posponer o actualizar bloqueando la pantalla con descarga directa sin salir a la tienda).
 */
export async function checkForAppUpdates(): Promise<void> {
  if (Platform.OS === 'web') return;

  // En entorno de desarrollo local, Google Play no tiene registro de la firma/versión
  if (__DEV__) {
    return;
  }

  try {
    const inAppUpdates = getInAppUpdates();
    const result = await inAppUpdates.checkNeedsUpdate();

    if (result?.shouldUpdate) {
      let updateOptions: StartUpdateOptions = {};

      if (Platform.OS === 'android') {
        updateOptions = {
          updateType: IAUUpdateKind.IMMEDIATE,
        };
      }

      await inAppUpdates.startUpdate(updateOptions);
    }
  } catch (error) {
    // Si el usuario cancela ("Ahora no") o hay un problema de conectividad con Play Store,
    // se captura de forma silenciosa para no interrumpir el uso normal de la app.
    console.warn('[InAppUpdates] Error checking or starting update:', error);
  }
}
