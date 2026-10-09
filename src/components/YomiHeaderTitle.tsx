import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';

/** Título del encabezado de las pestañas: "Yomi • <subtítulo>". */
export function YomiHeaderTitle({ subtitle }: { subtitle: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.brand, { color: colors.primary }]}>Yomi</Text>
      <Text style={[styles.separator, { color: colors.textMuted }]}> • </Text>
      <Text style={[styles.subtitle, { color: colors.text }]}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brand: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  separator: {
    fontSize: 18,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '600',
  },
});
