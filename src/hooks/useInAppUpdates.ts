import { useEffect } from 'react';
import { Alert } from 'react-native';
import {
  checkForAppUpdates,
  subscribeToPlayStoreUpdateReady,
  completePlayStoreUpdate,
} from '../lib/in-app-updates';

import { useTranslation } from '../i18n';

/**
 * Hook para comprobar automáticamente si existe una nueva versión de Yomi
 * en Google Play al abrir la aplicación y gestionar su descarga en segundo plano.
 */
export function useInAppUpdates() {
  const { t } = useTranslation();

  useEffect(() => {
    checkForAppUpdates();

    const unsubscribe = subscribeToPlayStoreUpdateReady((ready) => {
      if (ready) {
        Alert.alert(
          t('common.updateReadyTitle'),
          t('common.updateReadyMsg'),
          [
            { text: t('common.later'), style: 'cancel' },
            {
              text: t('common.restart'),
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
