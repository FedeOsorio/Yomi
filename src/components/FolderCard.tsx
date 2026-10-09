import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Folder } from '../../lib/deck-service';

interface FolderCardProps {
  folder: Folder;
  /** Mazos dentro de la carpeta (incluye los de sus subcarpetas). */
  deckCount: number;
  /** Subcarpetas directas. */
  subfolderCount: number;
  textColor: string;
  onPress: () => void;
  onLongPress: () => void;
}

export const FOLDER_CARD_WIDTH = 90;
export const FOLDER_CARD_HEIGHT = 66;

// Silueta de la carpeta (viewBox 110 x 86): solapa trasera con pestaña y bolsillo delantero.
const BACK_PATH =
  'M 10 4 Q 10 0, 16 0 L 48 0 Q 54 0, 58 6 L 62 10 L 100 10 Q 108 10, 108 18 L 108 80 Q 108 86, 100 86 L 10 86 Q 2 86, 2 80 L 2 12 Q 2 4, 10 4 Z';
const FRONT_PATH = 'M 2 26 Q 2 20, 10 20 L 100 20 Q 108 20, 108 26 L 108 80 Q 108 86, 100 86 L 10 86 Q 2 86, 2 80 Z';

/**
 * Carpeta translúcida: el color de la carpeta se ve como un vidrio tintado sobre el fondo,
 * igual que las insignias de carpeta de las tarjetas de mazo.
 */
export function FolderCard({ folder, deckCount, subfolderCount, textColor, onPress, onLongPress }: FolderCardProps) {
  const color = folder.color || '#3B82F6';
  const gradientId = `folder_grad_${folder.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} onLongPress={onLongPress} style={styles.container}>
      <Svg width={FOLDER_CARD_WIDTH} height={FOLDER_CARD_HEIGHT} viewBox="0 0 110 86">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.34} />
            <Stop offset="100%" stopColor={color} stopOpacity={0.16} />
          </LinearGradient>
        </Defs>
        <Path d={BACK_PATH} fill={color} fillOpacity={0.14} stroke={color} strokeOpacity={0.35} strokeWidth={1} />
        <Path d={FRONT_PATH} fill={`url(#${gradientId})`} stroke={color} strokeOpacity={0.55} strokeWidth={1.2} />
      </Svg>

      <View style={styles.contentOverlay} pointerEvents="none">
        <View style={styles.topRow}>
          {subfolderCount > 0 ? (
            <View style={styles.subfolderHint}>
              <Ionicons name="folder" size={10} color={color} />
              <Text style={[styles.hintText, { color }]}>{subfolderCount}</Text>
            </View>
          ) : (
            <View />
          )}
          {deckCount > 0 && (
            <View style={[styles.deckCountBadge, { backgroundColor: `${color}33` }]}>
              <Text style={[styles.deckCountText, { color: textColor }]}>{deckCount}</Text>
            </View>
          )}
        </View>

        <Text style={[styles.folderTitle, { color: textColor }]} numberOfLines={2}>
          {folder.name}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: FOLDER_CARD_WIDTH,
    height: FOLDER_CARD_HEIGHT,
  },
  contentOverlay: {
    position: 'absolute',
    top: 24,
    left: 10,
    right: 10,
    bottom: 8,
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 18,
  },
  subfolderHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  hintText: {
    fontSize: 10,
    fontWeight: '800',
  },
  deckCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  deckCountText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  folderTitle: {
    fontSize: 13,
    lineHeight: 16.5,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
