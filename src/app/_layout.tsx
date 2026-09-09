import { Stack } from 'expo-router';
import { DatabaseProvider } from '../../providers/DatabaseProvider';
import { ThemeProvider } from '../../providers/ThemeProvider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableFreeze } from 'react-native-screens';
import { OTAUpdateOverlay } from '../components/OTAUpdateOverlay';

enableFreeze(true);

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <DatabaseProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              animationDuration: 220,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="search/picker" options={{ presentation: 'modal', title: 'Seleccionar Resultados' }} />
            <Stack.Screen name="deck/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="deck/import" options={{ headerShown: false }} />
            <Stack.Screen name="word/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="search" options={{ headerShown: false }} />
          </Stack>
          <OTAUpdateOverlay />
        </DatabaseProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
