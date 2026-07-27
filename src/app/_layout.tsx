import { Stack } from 'expo-router';
import { DatabaseProvider } from '../../providers/DatabaseProvider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DatabaseProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="search/picker" options={{ presentation: 'modal', title: 'Seleccionar Resultados' }} />
          <Stack.Screen name="deck/[id]" options={{ title: 'Detalle de Mazo' }} />
        </Stack>
      </DatabaseProvider>
    </GestureHandlerRootView>
  );
}
