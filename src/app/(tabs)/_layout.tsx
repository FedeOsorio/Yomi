import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../providers/ThemeProvider';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarStyle } from '../../constants/theme';

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const renderYomiHeaderTitle = (subtitle: string) => (
    <View style={styles.headerTitleRow}>
      <Text style={[styles.brandText, { color: colors.primary }]}>Yomi</Text>
      <Text style={[styles.separatorText, { color: colors.textMuted }]}> • </Text>
      <Text style={[styles.subtitleText, { color: colors.text }]}>{subtitle}</Text>
    </View>
  );

  // Botón adaptativo para la barra flotante: ocupa el ancho y alto completo de la celda
  // sin forzar una máscara circular de 58x58 ni overflow: 'hidden' que recorte el texto con fuentes grandes
  const AdaptiveTabButton = (props: any) => {
    const { children, onPress } = props;
    return (
      <View style={styles.tabCellWrapper}>
        <Pressable
          onPress={onPress}
          android_ripple={{
            color: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
            borderless: false,
            foreground: true,
          }}
          style={styles.tabPressable}
        >
          {children}
        </Pressable>
      </View>
    );
  };

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerStatusBarHeight: insets.top,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarButton: (props) => <AdaptiveTabButton {...props} />,
        tabBarStyle: getFloatingTabBarStyle(colors, insets.bottom),
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          maxFontSizeMultiplier: 1.25,
        },
        headerStyle: {
          backgroundColor: colors.background,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          height: insets.top + 44,
        },
        headerTitleContainerStyle: {
          paddingBottom: 6,
        },
        headerTitleAlign: 'left',
      })}
    >
      <Tabs.Screen 
        name="index" 
        options={{ 
          headerTitle: () => renderYomiHeaderTitle('Mis Colecciones'), 
          tabBarLabel: 'Mazos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="albums-outline" size={size} color={color} />
          ),
        }} 
      />
      <Tabs.Screen 
        name="review" 
        options={{ 
          headerTitle: () => renderYomiHeaderTitle('Repaso SRS'), 
          tabBarLabel: 'Repaso',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
        }} 
      />
      <Tabs.Screen 
        name="profile" 
        options={{ 
          headerTitle: () => renderYomiHeaderTitle('Perfil y Ajustes'), 
          tabBarLabel: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }} 
      />
      <Tabs.Screen 
        name="decks" 
        options={{ 
          href: null,
        }} 
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  separatorText: {
    fontSize: 18,
    fontWeight: '600',
  },
  subtitleText: {
    fontSize: 17,
    fontWeight: '600',
  },
  tabCellWrapper: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabPressable: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 3,
  },
});
