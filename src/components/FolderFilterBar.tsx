import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import { Folder } from '../../lib/deck-service';
import { useTheme } from '../../providers/ThemeProvider';
import { Shadows, Spacing } from '../constants/theme';
import { useTranslation } from '../i18n';
import { FolderCard } from './FolderCard';

export const FOLDER_PALETTE = [
  '#3B82F6', // Azul
  '#10B981', // Esmeralda / Verde
  '#8B5CF6', // Púrpura
  '#F59E0B', // Ámbar / Naranja
  '#EF4444', // Rojo
  '#06B6D4', // Cian
  '#EC4899', // Rosa
  '#64748B', // Pizarra
];

interface FolderFilterBarProps {
  folders: Folder[];
  selectedFolderId: string | null; // null = sin carpeta (muestra todo)
  deckCounts: { [folderId: string]: number; total: number; unassigned: number };
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (name: string, color?: string | null) => Promise<void>;
  onRenameFolder: (folderId: string, newName: string, color?: string | null) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onReorderFolders?: (orderedIds: string[]) => Promise<void>;
}

export function FolderFilterBar({
  folders,
  selectedFolderId,
  deckCounts,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onReorderFolders,
}: FolderFilterBarProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const router = useRouter();

  // Dropdown de 3 puntitos en el header
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [dropdownCoords, setDropdownCoords] = useState<{ top: number; right: number }>({
    top: 60,
    right: 16,
  });
  const dotsRef = useRef<View>(null);

  // Modales
  const [modalMode, setModalMode] = useState<'create' | 'rename' | null>(null);
  const [folderToEdit, setFolderToEdit] = useState<Folder | null>(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(FOLDER_PALETTE[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  const openCreateDialog = () => {
    setFolderNameInput('');
    setSelectedColor(FOLDER_PALETTE[0]);
    setFolderToEdit(null);
    setModalMode('create');
  };

  const openRenameDialog = (folder: Folder) => {
    setFolderToEdit(folder);
    setFolderNameInput(folder.name);
    setSelectedColor(folder.color || FOLDER_PALETTE[0]);
    setModalMode('rename');
  };

  const closeDialog = () => {
    Keyboard.dismiss();
    setModalMode(null);
    setFolderToEdit(null);
    setFolderNameInput('');
  };

  const handleSubmitDialog = async () => {
    const trimmed = folderNameInput.trim();
    if (!trimmed) {
      Alert.alert(t('common.attention'), t('folders.folderNamePrompt'));
      return;
    }

    setIsSubmitting(true);
    try {
      if (modalMode === 'create') {
        await onCreateFolder(trimmed, selectedColor);
      } else if (modalMode === 'rename' && folderToEdit) {
        await onRenameFolder(folderToEdit.id, trimmed, selectedColor);
      }
      closeDialog();
    } catch (e: any) {
      console.error('Error al guardar carpeta:', e);
      Alert.alert(t('common.error'), `${t('folders.folderSaveError')}: ${e?.message || ''}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromptDelete = (folder: Folder) => {
    Alert.alert(
      t('folders.deleteFolder'),
      t('folders.deleteFolderConfirm', { name: folder.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await onDeleteFolder(folder.id);
          },
        },
      ]
    );
  };

  // Reordenar carpetas (mover arriba o abajo)
  const handleMoveFolder = async (index: number, direction: 'up' | 'down') => {
    if (!onReorderFolders) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= folders.length) return;

    const newFolders = [...folders];
    const [moved] = newFolders.splice(index, 1);
    newFolders.splice(targetIndex, 0, moved);

    const orderedIds = newFolders.map((f) => f.id);
    await onReorderFolders(orderedIds);
  };

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
      {/* Barra de Carpetas físicas altas estilo Samsung Notes */}
      {folders.length > 0 && (
        <View style={styles.container}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollList}
            keyboardShouldPersistTaps="handled"
          >
            {folders.map((folder) => {
              const isSelected = selectedFolderId === folder.id;
              const count = deckCounts[folder.id] ?? 0;

              return (
                <Animated.View
                  key={folder.id}
                  entering={FadeIn.duration(160)}
                  exiting={FadeOut.duration(100)}
                  layout={LinearTransition.duration(180)}
                >
                  <FolderCard
                    folder={folder}
                    isSelected={isSelected}
                    deckCount={count}
                    textColor={colors.text}
                    onPress={() => onSelectFolder(isSelected ? null : folder.id)}
                    onLongPress={() => openRenameDialog(folder)}
                  />
                </Animated.View>
              );
            })}
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
                openCreateDialog();
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

      {/* Modal para Crear / Editar Carpeta */}
      <Modal
        visible={modalMode !== null}
        transparent={true}
        animationType="none"
        onRequestClose={closeDialog}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(120)}
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={closeDialog} />
          </Animated.View>

          <View style={styles.modalCenterContainer} pointerEvents="box-none">
            <Animated.View
              entering={FadeInDown.duration(200)}
              exiting={FadeOut.duration(120)}
              style={[
                styles.dialogCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}
            >
              {/* Header */}
              <View style={styles.dialogHeader}>
                <View style={[styles.dialogIconBox, { backgroundColor: `${selectedColor}22` }]}>
                  <Ionicons name="folder" size={20} color={selectedColor} />
                </View>
                <Text style={[styles.dialogTitle, { color: colors.text }]}>
                  {modalMode === 'create' ? t('folders.createFolder') : t('folders.renameFolder')}
                </Text>
              </View>

              {/* Input nombre */}
              <TextInput
                style={[
                  styles.dialogInput,
                  {
                    backgroundColor: colors.surfaceHighlight,
                    borderColor: colors.border,
                    color: colors.text,
                  },
                ]}
                placeholder={t('folders.folderNamePrompt')}
                placeholderTextColor={colors.textMuted}
                value={folderNameInput}
                onChangeText={setFolderNameInput}
                autoFocus={true}
                selectionColor={selectedColor}
                returnKeyType="done"
                onSubmitEditing={handleSubmitDialog}
              />

              {/* Paleta de colores pastel translúcidos */}
              <View style={styles.paletteSection}>
                <Text style={[styles.paletteLabel, { color: colors.textMuted }]}>
                  {t('folders.color')}
                </Text>
                <View style={styles.colorPaletteRow}>
                  {FOLDER_PALETTE.map((color) => {
                    const isColorActive = selectedColor.toLowerCase() === color.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={color}
                        style={[
                          styles.colorCircle,
                          { backgroundColor: color },
                          isColorActive && {
                            borderColor: colors.surface,
                            borderWidth: 2,
                            transform: [{ scale: 1.15 }],
                          },
                        ]}
                        onPress={() => setSelectedColor(color)}
                        activeOpacity={0.8}
                      >
                        {isColorActive && (
                          <Ionicons name="checkmark" size={13} color="#FFF" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Botones de acción DENTRO del cuerpo de la tarjeta */}
              <View style={styles.dialogActions}>
                <TouchableOpacity
                  style={[
                    styles.dialogBtn,
                    styles.dialogBtnCancel,
                    { borderColor: colors.border, backgroundColor: colors.surfaceHighlight },
                  ]}
                  onPress={closeDialog}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.dialogBtnCancelText, { color: colors.text }]}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.dialogBtn,
                    styles.dialogBtnConfirm,
                    { backgroundColor: selectedColor },
                  ]}
                  onPress={handleSubmitDialog}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.dialogBtnConfirmText}>
                      {t('common.save')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCenterContainer: {
    width: '100%',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: Spacing.lg,
    borderWidth: 1.5,
    ...Shadows.card,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  dialogIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  dialogInput: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    marginBottom: 16,
  },
  paletteSection: {
    marginBottom: 20,
  },
  paletteLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  colorPaletteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  colorCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
    elevation: 2,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  dialogBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogBtnCancel: {
    borderWidth: 1,
  },
  dialogBtnConfirm: {
    borderWidth: 0,
  },
  dialogBtnCancelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  dialogBtnConfirmText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
