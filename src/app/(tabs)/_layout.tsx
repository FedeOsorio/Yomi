import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
        },
        headerStyle: {
          backgroundColor: Colors.background,
        },
        headerTitleStyle: {
          color: Colors.text,
        },
      }}
    >
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Mis Mazos', 
          tabBarLabel: 'Mazos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums-outline" size={size} color={color} />
          ),
        }} 
      />
      <Tabs.Screen 
        name="review" 
        options={{ 
          title: 'Repaso SRS', 
          tabBarLabel: 'Repaso',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
        }} 
      />
      <Tabs.Screen 
        name="decks" 
        options={{ 
          href: null, // Ocultar pestaña duplicada de decks
        }} 
      />
    </Tabs>
  );
}
