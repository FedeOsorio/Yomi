import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Folder } from '../../lib/deck-service';
import { useTheme } from '../../providers/ThemeProvider';
import { Shadows, Spacing } from '../constants/theme';
import { useTranslation } from '../i18n';
import { FolderCard } from './FolderCard';

interface FolderFilterBarProps {
  /** Carpetas a mostrar: las hijas de la carpeta abierta (o las de Inicio). */
  folders: Folder[];
  /** Mazos por carpeta, contando subcarpetas. */
  deckCounts: Record<string, number>;
  /** Subcarpetas directas por carpeta. */
  subfolderCounts: Record<string, number>;
  onOpenFolder: (folder: Folder) => void;
  onFolderLongPress: (folder: Folder) => void;
  /** "Crear carpeta" del menú ⋮ (se crea dentro de la carpeta abierta). */
  onCreateFolder: () => void;
}

/** Fila de carpetas estilo Samsung Notes + menú ⋮ del encabezado. Tocar una carpeta la abre. */
export function FolderFilterBar({
  folders,
  deckCounts,
  subfolderCounts,
  onOpenFolder,
  onFolderLongPress,
  onCreateFolder,
}: FolderFilterBarProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const router = useRouter();

  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownCoords, setDropdownCoords] = useState<{ top: number; right: number }>({ top: 60, right: 16 });
  const dotsRef = useRef<View>(null);

  const handleToggleDropdown = useCallback(() => {
    if (dropdownVisible) {
      setDropdownVisible(false);
      return;
    }

    if (dotsRef.current?.measureInWindow) {
      dotsRef.current.measureInWindow((x, y, width, height) => {
        const screenWidth = Dimensions.get('window').width;
        const topCoord = y && height ? Math.round(y + height + 6) : 60;
        const rightCoord = x && width ? Math.max(16, Math.round(screenWidth - (x + width))) : 16;
        setDropdownCoords({ top: topCoord, right: rightCoord });
        setDropdownVisible(true);
      });
    } else {
      setDropdownCoords({ top: 60, right: 16 });
      setDropdownVisible(true);
    }
  }, [dropdownVisible]);

  // Colocar los 3 puntitos en el header de la aplicación
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View ref={dotsRef} collapsable={false} style={styles.headerRightContainer}>
          <TouchableOpacity
            style={[
              styles.headerDotsBtn,
              dropdownVisible && { backgroundColor: colors.surfaceHighlight },
            ]}
            activeOpacity={0.7}
            onPress={handleToggleDropdown}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Opciones de carpetas"
          >
            <Ionicons
              name="ellipsis-vertical"
              size={20}
              color={dropdownVisible ? colors.primary : colors.text}
            />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, colors, dropdownVisible, handleToggleDropdown]);

  return (
    <>
      {folders.length > 0 && (
        <View style={styles.container}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollList}
            keyboardShouldPersistTaps="handled"
          >
            {folders.map((folder) => (
              <Animated.View
                key={folder.id}
                entering={FadeIn.duration(160)}
                exiting={FadeOut.duration(100)}
                layout={LinearTransition.duration(180)}
              >
                <FolderCard
                  folder={folder}
                  deckCount={deckCounts[folder.id] ?? 0}
                  subfolderCount={subfolderCounts[folder.id] ?? 0}
                  textColor={colors.text}
                  onPress={() => onOpenFolder(folder)}
                  onLongPress={() => onFolderLongPress(folder)}
                />
              </Animated.View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Dropdown Menu Flotante en el header */}
      <Modal
        visible={dropdownVisible}
        transparent={true}
        animationType="none"
        onRequestClose={() => setDropdownVisible(false)}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setDropdownVisible(false)}
        >
          <Animated.View
            entering={FadeIn.duration(120)}
            exiting={FadeOut.duration(90)}
            style={[
              styles.dropdownMenu,
              {
                top: dropdownCoords.top,
                right: dropdownCoords.right,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            {/* Opción Crear Carpeta */}
            <TouchableOpacity
              style={styles.dropdownItem}
              activeOpacity={0.7}
              onPress={() => {
                setDropdownVisible(false);
                onCreateFolder();
              }}
            >
              <Ionicons name="folder-outline" size={18} color={colors.primary} />
              <Text style={[styles.dropdownItemText, { color: colors.text }]}>
                {t('folders.createFolder')}
              </Text>
            </TouchableOpacity>

            <View style={[styles.dropdownDivider, { backgroundColor: colors.border }]} />

            {/* Opción Administrar Carpetas */}
            <TouchableOpacity
              style={styles.dropdownItem}
              activeOpacity={0.7}
              onPress={() => {
                setDropdownVisible(false);
                router.push('/folders');
              }}
            >
              <Ionicons name="settings-outline" size={17} color={colors.textMuted} />
              <Text style={[styles.dropdownItemText, { color: colors.text }]}>
                {t('folders.manageFolders')}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>

    </>
  );
}

const styles = StyleSheet.create({
  headerRightContainer: {
    marginRight: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerDotsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    paddingVertical: Spacing.md,
    zIndex: 10,
  },
  scrollList: {
    paddingHorizontal: Spacing.md,
    gap: 5,
    alignItems: 'flex-start',
  },

  dropdownMenu: {
    position: 'absolute',
    minWidth: 195,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 6,
    ...Shadows.card,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 10,
  },
});
