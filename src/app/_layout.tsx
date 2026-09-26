import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { DatabaseProvider } from '../../providers/DatabaseProvider';
import { ThemeProvider, useTheme } from '../../providers/ThemeProvider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableFreeze } from 'react-native-screens';
import { OTAUpdateOverlay } from '../components/OTAUpdateOverlay';
import { useIncomingFileHandler } from '../../lib/incoming-file-service';
import { useInAppUpdates } from '../hooks/useInAppUpdates';

WebBrowser.maybeCompleteAuthSession();
// Desactivar freeze para evitar parpadeos y retrasos de render en transiciones con React 19
enableFreeze(false);

function RootStack() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 220,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="search/picker" options={{ presentation: 'modal', title: 'Seleccionar Resultados' }} />
      <Stack.Screen name="deck/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="deck/import" options={{ headerShown: false }} />
      <Stack.Screen name="word/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="search" options={{ headerShown: false }} />
      <Stack.Screen name="oauthredirect" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  useIncomingFileHandler();
  useInAppUpdates();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <DatabaseProvider>
          <RootStack />
          <OTAUpdateOverlay />
        </DatabaseProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
