import { Platform } from 'react-native';
import SpInAppUpdates, {
  IAUUpdateKind,
  IAUInstallStatus,
  StartUpdateOptions,
  StatusUpdateEvent,
} from 'sp-react-native-in-app-updates';

let inAppUpdatesInstance: SpInAppUpdates | null = null;
let isStatusListenerRegistered = false;
let isUpdateDownloaded = false;

const updateReadyListeners = new Set<(isReady: boolean) => void>();

export function getInAppUpdates(): SpInAppUpdates {
  if (!inAppUpdatesInstance) {
    inAppUpdatesInstance = new SpInAppUpdates(false);
  }
  return inAppUpdatesInstance;
}

/**
 * Suscribe un callback que se ejecuta cuando una actualización de Google Play
 * ha terminado de descargarse en segundo plano y está lista para instalarse.
 */
export function subscribeToPlayStoreUpdateReady(callback: (isReady: boolean) => void): () => void {
  updateReadyListeners.add(callback);
  if (isUpdateDownloaded) {
    callback(true);
  }
  return () => {
    updateReadyListeners.delete(callback);
  };
}

/**
 * Completa la instalación de la actualización flexible previamente descargada de Google Play,
 * reiniciando la aplicación con la nueva versión.
 */
export function completePlayStoreUpdate(): void {
  try {
    const inAppUpdates = getInAppUpdates();
    inAppUpdates.installUpdate();
  } catch (error) {
    console.warn('[InAppUpdates] Error al instalar actualización de Google Play:', error);
  }
}

function initStatusListener(): void {
  if (isStatusListenerRegistered || Platform.OS !== 'android') return;
  try {
    const inAppUpdates = getInAppUpdates();
    inAppUpdates.addStatusUpdateListener((event: StatusUpdateEvent) => {
      if (event.status === IAUInstallStatus.DOWNLOADED) {
        isUpdateDownloaded = true;
        updateReadyListeners.forEach((listener) => listener(true));
      }
    });
    isStatusListenerRegistered = true;
  } catch (error) {
    console.warn('[InAppUpdates] Error al registrar listener de estado:', error);
  }
}

/**
 * Consulta a Google Play si hay una actualización disponible para Yomi.
 * Si existe, lanza el flujo FLEXIBLE en segundo plano (Google Play descarga la actualización
 * en background sin bloquear la pantalla ni interrumpir al usuario).
 */
export async function checkForAppUpdates(): Promise<void> {
  if (Platform.OS === 'web') return;

  // En entorno de desarrollo local, Google Play no tiene registro de la firma/versión
  if (__DEV__) {
    return;
  }

  try {
    const inAppUpdates = getInAppUpdates();
    initStatusListener();

    const result = await inAppUpdates.checkNeedsUpdate();

    if (result?.shouldUpdate) {
      let updateOptions: StartUpdateOptions = {};

      if (Platform.OS === 'android') {
        // En lugar de IMMEDIATE (que bloquea la pantalla con modal de Play Store),
        // usamos FLEXIBLE para que la descarga ocurra completamente en segundo plano.
        updateOptions = {
          updateType: IAUUpdateKind.FLEXIBLE,
        };
      }

      await inAppUpdates.startUpdate(updateOptions);
    }
  } catch (error) {
    // Si el usuario cancela o hay un problema de conectividad con Play Store,
    // se captura de forma silenciosa para no interrumpir el uso normal de la app.
    console.warn('[InAppUpdates] Error comprobando o iniciando actualización flexible:', error);
  }
}
