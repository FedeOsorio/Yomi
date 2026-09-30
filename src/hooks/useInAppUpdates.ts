import { useEffect } from 'react';
import { Alert } from 'react-native';
import {
  checkForAppUpdates,
  subscribeToPlayStoreUpdateReady,
  completePlayStoreUpdate,
} from '../lib/in-app-updates';

/**
 * Hook para comprobar automáticamente si existe una nueva versión de Yomi
 * en Google Play al abrir la aplicación y gestionar su descarga en segundo plano.
 */
export function useInAppUpdates() {
  useEffect(() => {
    checkForAppUpdates();

    const unsubscribe = subscribeToPlayStoreUpdateReady((ready) => {
      if (ready) {
        Alert.alert(
          'Actualización de Google Play lista',
          'La nueva versión se descargó en segundo plano. ¿Deseas reiniciar la aplicación ahora para aplicarla?',
          [
            { text: 'Más tarde', style: 'cancel' },
            {
              text: 'Reiniciar',
              onPress: () => {
                completePlayStoreUpdate();
              },
            },
          ]
        );
      }
    });

    return unsubscribe;
  }, []);
}
