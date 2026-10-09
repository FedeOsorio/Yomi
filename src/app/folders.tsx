import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notifyDataChanged, onDataChanged } from '../../lib/backup-service';
import {
  createFolder,
  deleteFolder,
  Folder,
  getDecksWithStats,
  getFolders,
  renameFolder,
  reorderFolders,
} from '../../lib/deck-service';
import { useTheme } from '../../providers/ThemeProvider';
import { FOLDER_PALETTE } from '../components/FolderFilterBar';
import { Shadows, Spacing, Typography } from '../constants/theme';
import { useTranslation } from '../i18n';

export default function FoldersScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [deckCounts, setDeckCounts] = useState<{ [folderId: string]: number }>({});
  const [isLoading, setIsLoading] = useState(true);

  // Dialog Crear / Editar
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [folderToEdit, setFolderToEdit] = useState<Folder | null>(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(FOLDER_PALETTE[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [fList, dList] = await Promise.all([getFolders(), getDecksWithStats()]);
      setFolders(fList);

      const counts: { [folderId: string]: number } = {};
      for (const d of dList) {
        if (d.folderId) {
          counts[d.folderId] = (counts[d.folderId] || 0) + 1;
        }
      }
      setDeckCounts(counts);
    } catch (e) {
      console.error('Error al cargar carpetas en pantalla:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsub = onDataChanged(() => {
      loadData();
    });
    return unsub;
  }, [loadData]);

  const openCreateDialog = () => {
    setFolderToEdit(null);
    setFolderNameInput('');
    setSelectedColor(FOLDER_PALETTE[0]);
    setDialogMode('create');
  };

  const openEditDialog = (folder: Folder) => {
    setFolderToEdit(folder);
    setFolderNameInput(folder.name);
    setSelectedColor(folder.color || FOLDER_PALETTE[0]);
    setDialogMode('edit');
  };

  const closeDialog = () => {
    Keyboard.dismiss();
    setDialogMode(null);
    setFolderToEdit(null);
    setFolderNameInput('');
  };

  const handleSubmitDialog = async () => {
    const trimmed = folderNameInput.trim();
    if (!trimmed) {
      Alert.alert(t('common.attention'), t('folders.folderNameRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      if (dialogMode === 'create') {
        await createFolder(trimmed, selectedColor);
      } else if (dialogMode === 'edit' && folderToEdit) {
        await renameFolder(folderToEdit.id, trimmed, selectedColor);
      }
      closeDialog();
      await loadData();
      notifyDataChanged();
    } catch (e: any) {
      console.error('Error al guardar carpeta:', e);
      Alert.alert(t('common.error'), `${t('folders.folderSaveError')}: ${e?.message || t('common.error')}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromptDelete = (folder: Folder) => {
    Alert.alert(
      t('folders.deleteFolder'),
      t('folders.deleteFolderNotice', { name: folder.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFolder(folder.id);
              await loadData();
              notifyDataChanged();
            } catch (err: any) {
              Alert.alert(t('common.error'), t('folders.deleteFolderError'));
            }
          },
        },
      ]
    );
  };

  const handleMoveFolder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= folders.length) return;

    const newFolders = [...folders];
    const [moved] = newFolders.splice(index, 1);
    newFolders.splice(targetIndex, 0, moved);
    setFolders(newFolders);

    try {
      const orderedIds = newFolders.map((f) => f.id);
      await reorderFolders(orderedIds);
      notifyDataChanged();
    } catch (e) {
      console.error('Error al reordenar carpetas:', e);
      loadData();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Superior Nativo de Pantalla */}
      <View
        style={[
          styles.headerRow,
          {
            borderBottomColor: colors.border,
            paddingTop: insets.top + 6,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.brandTitleContainer}>
          <Text style={[styles.brandText, { color: colors.primary }]}>Yomi</Text>
          <Text style={[styles.brandSep, { color: colors.textMuted }]}> • </Text>
          <Text style={[styles.title, { color: colors.text }]}>{t('folders.manageFolders')}</Text>
        </View>

        <TouchableOpacity
          onPress={openCreateDialog}
          style={styles.headerAddBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={t('folders.createFolder')}
        >
          <Ionicons name="add" size={26} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Contenido Principal con Scroll Completo de Pantalla */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={true}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom + 24, 40) },
          ]}
        >
          {/* Subtítulo explicativo */}
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
            {t('folders.organizeSubtitle')}
          </Text>

          {/* Botón "+ Crear nueva carpeta" */}
          <TouchableOpacity
            style={[
              styles.createActionCard,
              {
                backgroundColor: colors.surfaceHighlight,
                borderColor: colors.border,
              },
            ]}
            activeOpacity={0.75}
            onPress={openCreateDialog}
          >
            <View style={[styles.createIconBox, { backgroundColor: `${colors.primary}20` }]}>
              <Ionicons name="add" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.createActionText, { color: colors.primary }]}>
              {t('folders.newFolder')}
            </Text>
          </TouchableOpacity>

          {/* Lista de Carpetas con altura natural y sin límites de modal */}
          {folders.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="folder-open-outline" size={56} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {t('folders.noFoldersTitle')}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                {t('folders.noFoldersSub')}
              </Text>
            </View>
          ) : (
            folders.map((folder, index) => {
              const folderColor = folder.color || FOLDER_PALETTE[0];
              const count = deckCounts[folder.id] || 0;
              const isFirst = index === 0;
              const isLast = index === folders.length - 1;

              return (
                <Animated.View
                  key={folder.id}
                  layout={LinearTransition.duration(200)}
                  entering={FadeIn.duration(160)}
                  exiting={FadeOut.duration(120)}
                >
                  <View
                    style={[
                      styles.folderRowItem,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    {/* Información de la carpeta */}
                    <View style={styles.folderInfoCol}>
                      <View
                        style={[
                          styles.folderColorDot,
                          {
                            backgroundColor: `${folderColor}25`,
                            borderColor: `${folderColor}55`,
                          },
                        ]}
                      >
                        <Ionicons name="folder" size={18} color={folderColor} />
                      </View>

                      <View style={styles.folderTextContainer}>
                        <Text style={[styles.folderName, { color: colors.text }]} numberOfLines={1}>
                          {folder.name}
                        </Text>
                        <Text style={[styles.folderCount, { color: colors.textMuted }]}>
                          {t('folders.deckCount', { count })}
                        </Text>
                      </View>
                    </View>

                    {/* Botones de acción: Subir, Bajar, Editar, Eliminar */}
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, isFirst && styles.actionBtnDisabled]}
                        disabled={isFirst}
                        onPress={() => handleMoveFolder(index, 'up')}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityLabel="Up"
                      >
                        <Ionicons
                          name="chevron-up"
                          size={20}
                          color={isFirst ? colors.textMuted + '40' : colors.text}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.actionBtn, isLast && styles.actionBtnDisabled]}
                        disabled={isLast}
                        onPress={() => handleMoveFolder(index, 'down')}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityLabel="Down"
                      >
                        <Ionicons
                          name="chevron-down"
                          size={20}
                          color={isLast ? colors.textMuted + '40' : colors.text}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => openEditDialog(folder)}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityLabel={t('folders.renameFolder')}
                      >
                        <Ionicons name="pencil-outline" size={18} color={colors.textMuted} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handlePromptDelete(folder)}
                        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                        accessibilityLabel={t('folders.deleteFolder')}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Animated.View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Dialog para Crear / Editar Carpeta */}
      <Modal
        visible={dialogMode !== null}
        transparent={true}
        animationType="none"
        onRequestClose={closeDialog}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(100)}
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={closeDialog} />
          </Animated.View>

          <View style={styles.modalCenterContainer} pointerEvents="box-none">
            <Animated.View
              entering={FadeInDown.duration(200)}
              exiting={FadeOut.duration(100)}
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
                  {dialogMode === 'create' ? t('folders.newFolder') : t('folders.renameFolder')}
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
                placeholder={t('folders.folderPlaceholder')}
                placeholderTextColor={colors.textMuted}
                value={folderNameInput}
                onChangeText={setFolderNameInput}
                autoFocus={true}
                selectionColor={selectedColor}
                returnKeyType="done"
                onSubmitEditing={handleSubmitDialog}
              />

              {/* Paleta de colores pastel */}
              <View style={styles.paletteSection}>
                <Text style={[styles.paletteLabel, { color: colors.textMuted }]}>
                  {t('folders.folderColorLabel')}
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
                        {isColorActive && <Ionicons name="checkmark" size={13} color="#FFF" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Botones de acción dentro de la tarjeta */}
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
                      {dialogMode === 'create' ? t('decks.createBtn') : t('common.save')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    padding: 6,
    marginRight: 6,
  },
  brandTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandSep: {
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  headerAddBtn: {
    padding: 6,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  createActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: Spacing.md,
    gap: 12,
  },
  createIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createActionText: {
    fontSize: 15,
    fontWeight: '700',
  },
  folderRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    ...Shadows.card,
    elevation: 1,
  },
  folderInfoCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  folderColorDot: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  folderTextContainer: {
    flex: 1,
  },
  folderName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  folderCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: {
    padding: 7,
    borderRadius: 8,
  },
  actionBtnDisabled: {
    opacity: 0.35,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
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
