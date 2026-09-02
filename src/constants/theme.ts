export const DarkColors = {
  background: '#0B0D17', // Deep space dark
  surface: '#1A1D2D',
  surfaceHighlight: '#2A2E43',
  primary: '#3B82F6', // Vibrant blue
  primaryHover: '#60A5FA',
  secondary: '#10B981', // Emerald green
  text: '#F3F4F6',
  textMuted: '#9CA3AF',
  border: '#374151',
  danger: '#EF4444',
  warning: '#F59E0B',
};

export const LightColors = {
  background: '#F8FAFC', // Slate light
  surface: '#FFFFFF',
  surfaceHighlight: '#F1F5F9',
  primary: '#2563EB', // Blue 600
  primaryHover: '#3B82F6',
  secondary: '#059669', // Emerald 600
  text: '#0F172A', // Slate 900
  textMuted: '#64748B', // Slate 500
  border: '#E2E8F0', // Slate 200
  danger: '#DC2626',
  warning: '#D97706',
};

export const Colors = DarkColors;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Typography = {
  h1: { fontSize: 32, fontWeight: '700' as const, color: Colors.text },
  h2: { fontSize: 24, fontWeight: '600' as const, color: Colors.text },
  h3: { fontSize: 20, fontWeight: '600' as const, color: Colors.text },
  body: { fontSize: 16, color: Colors.text },
  bodySmall: { fontSize: 14, color: Colors.textMuted },
  chineseLarge: { fontSize: 48, fontWeight: 'bold' as const, color: Colors.text },
  chineseMedium: { fontSize: 32, fontWeight: 'bold' as const, color: Colors.text },
};

export const Shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  }
};
