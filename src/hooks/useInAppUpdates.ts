import { useEffect } from 'react';
import { checkForAppUpdates } from '../lib/in-app-updates';

/**
 * Hook para comprobar automáticamente si existe una nueva versión de Yomi
 * en Google Play al abrir la aplicación.
 */
export function useInAppUpdates() {
  useEffect(() => {
    checkForAppUpdates();
  }, []);
}
