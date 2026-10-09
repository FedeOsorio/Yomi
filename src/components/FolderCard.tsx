import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
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

export const FOLDER_CARD_WIDTH = 88;
export const FOLDER_CARD_HEIGHT = 90;

// Silueta de la carpeta (viewBox 100 x 102, un poco más alta que ancha como en Samsung Notes):
// solapa trasera con pestaña y bolsillo delantero.
const BACK_PATH =
  'M 2 10 Q 2 0, 12 0 L 38 0 Q 44 0, 48 5 L 52 10 L 88 10 Q 98 10, 98 20 L 98 90 Q 98 100, 88 100 L 12 100 Q 2 100, 2 90 Z';
const FRONT_PATH = 'M 2 30 Q 2 20, 12 20 L 88 20 Q 98 20, 98 30 L 98 90 Q 98 100, 88 100 L 12 100 Q 2 100, 2 90 Z';

// Presionar y soltar sin rebote: la carpeta vuelve justo a su tamaño
const PRESS_IN = { duration: 110, easing: Easing.out(Easing.quad) };
const PRESS_OUT = { duration: 180, easing: Easing.out(Easing.cubic) };

/**
 * Carpeta translúcida y sin bordes: el color se ve como un tinte sobre el fondo.
 * Al presionarla se achica y el bolsillo delantero "se abre" (baja un poco dejando ver la solapa).
 */
export function FolderCard({ folder, deckCount, subfolderCount, textColor, onPress, onLongPress }: FolderCardProps) {
  const color = folder.color || '#3B82F6';
  const gradientId = `folder_grad_${folder.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const pressed = useSharedValue(0);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.94]) }],
  }));
  const pocketStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(pressed.value, [0, 1], [0, 4]) },
      { scaleY: interpolate(pressed.value, [0, 1], [1, 0.94]) },
    ],
  }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => (pressed.value = withTiming(1, PRESS_IN))}
      onPressOut={() => (pressed.value = withTiming(0, PRESS_OUT))}
    >
      <Animated.View style={[styles.container, cardStyle]}>
        <Svg width={FOLDER_CARD_WIDTH} height={FOLDER_CARD_HEIGHT} viewBox="0 0 100 102">
          <Path d={BACK_PATH} fill={color} fillOpacity={0.22} />
        </Svg>

        <Animated.View style={[StyleSheet.absoluteFill, styles.pocket, pocketStyle]} pointerEvents="none">
          <Svg width={FOLDER_CARD_WIDTH} height={FOLDER_CARD_HEIGHT} viewBox="0 0 100 102">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={color} stopOpacity={0.45} />
                <Stop offset="100%" stopColor={color} stopOpacity={0.3} />
              </LinearGradient>
            </Defs>
            <Path d={FRONT_PATH} fill={`url(#${gradientId})`} />
          </Svg>

          <View style={styles.contentOverlay}>
            <View style={styles.topRow}>
              {subfolderCount > 0 ? (
                <View style={styles.subfolderHint}>
                  <Ionicons name="folder" size={10} color={textColor} style={{ opacity: 0.75 }} />
                  <Text style={[styles.hintText, { color: textColor }]}>{subfolderCount}</Text>
                </View>
              ) : (
                <View />
              )}
              {deckCount > 0 && (
                <View style={styles.deckCountBadge}>
                  <Text style={[styles.deckCountText, { color: textColor }]}>{deckCount}</Text>
                </View>
              )}
            </View>

            <Text style={[styles.folderTitle, { color: textColor }]} numberOfLines={2}>
              {folder.name}
            </Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: FOLDER_CARD_WIDTH,
    height: FOLDER_CARD_HEIGHT,
  },
  pocket: {
    transformOrigin: 'bottom',
  },
  contentOverlay: {
    position: 'absolute',
    top: 23,
    left: 8,
    right: 7,
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
    opacity: 0.75,
  },
  deckCountBadge: {
    backgroundColor: 'rgba(128, 128, 128, 0.22)',
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
