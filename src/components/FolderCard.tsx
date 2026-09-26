import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { Folder } from '../../lib/deck-service';

interface FolderCardProps {
  folder: Folder;
  isSelected: boolean;
  deckCount: number;
  textColor: string;
  onPress: () => void;
  onLongPress: () => void;
}

export const FOLDER_CARD_WIDTH = 90;
export const FOLDER_CARD_HEIGHT = 66;

export function FolderCard({
  folder,
  isSelected,
  deckCount,
  textColor,
  onPress,
  onLongPress,
}: FolderCardProps) {
  const folderColor = folder.color || '#3B82F6';
  const gradientId = `folder_card_grad_${folder.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.container,
        {
          shadowColor: folderColor,
        },
      ]}
    >
      {/* Gráfico Vectorial SVG sin bordes con relieve físico */}
      <Svg width={FOLDER_CARD_WIDTH} height={FOLDER_CARD_HEIGHT} viewBox="0 0 110 86">
        <Defs>
          {/* Gradiente más intenso para el bolsillo frontal */}
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop
              offset="0%"
              stopColor={folderColor}
              stopOpacity={isSelected ? 0.90 : 0.72}
            />
            <Stop
              offset="100%"
              stopColor={folderColor}
              stopOpacity={isSelected ? 0.78 : 0.58}
            />
          </LinearGradient>
        </Defs>

        {/* 1. Solapa Trasera (Back Flap & Tab) - Más clara y suave */}
        <Path
          d="
            M 10 4
            Q 10 0, 16 0
            L 48 0
            Q 54 0, 58 6
            L 62 10
            L 100 10
            Q 108 10, 108 18
            L 108 80
            Q 108 86, 100 86
            L 10 86
            Q 2 86, 2 80
            L 2 12
            Q 2 4, 10 4
            Z
          "
          fill={isSelected ? `${folderColor}35` : `${folderColor}22`}
        />

        {/* 2. Solapa Delantera (Front Pocket) - Más intensa, sin borders */}
        <Path
          d="
            M 2 26
            Q 2 20, 10 20
            L 100 20
            Q 108 20, 108 26
            L 108 80
            Q 108 86, 100 86
            L 10 86
            Q 2 86, 2 80
            Z
          "
          fill={`url(#${gradientId})`}
        />
      </Svg>

      {/* Contenido interior: sin emoji de carpeta, con conteo y título limpio */}
      <View style={styles.contentOverlay} pointerEvents="none">
        <View style={styles.topRow}>
          <View />
          {deckCount > 0 && (
            <View
              style={[
                styles.deckCountBadge,
                {
                  backgroundColor: isSelected
                    ? 'rgba(255, 255, 255, 0.35)'
                    : 'rgba(0, 0, 0, 0.18)',
                },
              ]}
            >
              <Text
                style={[
                  styles.deckCountText,
                  { color: isSelected ? '#FFFFFF' : textColor },
                ]}
              >
                {deckCount}
              </Text>
            </View>
          )}
        </View>

        <Text
          style={[
            styles.folderTitle,
            {
              color: isSelected ? '#FFFFFF' : textColor,
              fontWeight: isSelected ? '800' : '700',
            },
          ]}
          numberOfLines={2}
        >
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
    position: 'relative',
    marginRight: 4,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
    }),
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
  deckCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
    alignSelf: 'flex-end',
  },
  deckCountText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  folderTitle: {
    fontSize: 13,
    lineHeight: 16.5,
    letterSpacing: 0.1,
  },
});
