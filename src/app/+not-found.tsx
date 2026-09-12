import { Redirect } from 'expo-router';

/**
 * Captura cualquier ruta no coincidente (incluyendo URIs externas como content:// y file://
 * que se abren desde WhatsApp o exploradores de archivos) y redirige a la aplicación principal.
 */
export default function NotFoundScreen() {
  return <Redirect href="/(tabs)" />;
}
