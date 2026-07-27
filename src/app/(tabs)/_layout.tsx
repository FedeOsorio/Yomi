import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Búsqueda', tabBarLabel: 'Buscar' }} />
      <Tabs.Screen name="decks" options={{ title: 'Mazos', tabBarLabel: 'Mazos' }} />
      <Tabs.Screen name="review" options={{ title: 'Repaso', tabBarLabel: 'Repaso' }} />
    </Tabs>
  );
}
