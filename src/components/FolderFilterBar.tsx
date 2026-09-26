import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
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
  FadeOut,
  LinearTransition,
  ZoomIn,
} from 'react-native-reanimated';
import { Folder } from '../../lib/deck-service';
import { useTheme } from '../../providers/ThemeProvider';
import { Shadows, Spacing } from '../constants/theme';

interface FolderFilterBarProps {
  folders: Folder[];
  selectedFolderId: string | null; // null = 'Todos'
  deckCounts: { [folderId: string]: number; total: number; unassigned: number };
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (folderId: string, newName: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
}

export function FolderFilterBar({
  folders,
  selectedFolderId,
  deckCounts,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}: FolderFilterBarProps) {
  const { colors } = useTheme();
  const [modalMode, setModalMode] = useState<'create' | 'rename' | null>(null);
  const [folderToEdit, setFolderToEdit] = useState<Folder | null>(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCreateDialog = () => {
    setFolderNameInput('');
    setFolderToEdit(null);
    setModalMode('create');
  };

  const openRenameDialog = (folder: Folder) => {
    setFolderToEdit(folder);
    setFolderNameInput(folder.name);
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
      Alert.alert('Atención', 'Ingresa un nombre para la carpeta.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (modalMode === 'create') {
        await onCreateFolder(trimmed);
      } else if (modalMode === 'rename' && folderToEdit) {
        await onRenameFolder(folderToEdit.id, trimmed);
      }
      closeDialog();
    } catch {
      Alert.alert('Error', 'No se pudo guardar la carpeta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFolderLongPress = (folder: Folder) => {
    Alert.alert(
      folder.name,
      '¿Qué deseas hacer con esta carpeta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Renombrar',
          onPress: () => openRenameDialog(folder),
        },
        {
          text: 'Eliminar carpeta',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Eliminar Carpeta',
              `¿Deseas eliminar "${folder.name}"? Los mazos no se borrarán, solo quedarán sin carpeta.`,
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Eliminar',
                  style: 'destructive',
                  onPress: () => onDeleteFolder(folder.id),
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollList}
        keyboardShouldPersistTaps="handled"
      >
        {/* Chip "Todos" */}
        <Animated.View layout={LinearTransition.springify().damping(15)}>
          <TouchableOpacity
            style={[
              styles.chip,
              {
                backgroundColor:
                  selectedFolderId === null ? colors.primary : colors.surface,
                borderColor:
                  selectedFolderId === null ? colors.primary : colors.border,
              },
            ]}
            activeOpacity={0.75}
            onPress={() => onSelectFolder(null)}
          >
            <Ionicons
              name="albums"
              size={15}
              color={selectedFolderId === null ? '#FFF' : colors.textMuted}
            />
            <Text
              style={[
                styles.chipText,
                { color: selectedFolderId === null ? '#FFF' : colors.text },
              ]}
            >
              Todos
            </Text>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor:
                    selectedFolderId === null
                      ? 'rgba(255,255,255,0.25)'
                      : colors.surfaceHighlight,
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color: selectedFolderId === null ? '#FFF' : colors.textMuted,
                  },
                ]}
              >
                {deckCounts.total ?? 0}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Lista de Carpetas creadas */}
        {folders.map((folder) => {
          const isSelected = selectedFolderId === folder.id;
          const count = deckCounts[folder.id] ?? 0;

          return (
            <Animated.View
              key={folder.id}
              entering={ZoomIn.springify().damping(14)}
              exiting={FadeOut.duration(150)}
              layout={LinearTransition.springify().damping(15)}
            >
              <TouchableOpacity
                style={[
                  styles.chip,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.surface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.75}
                onPress={() => onSelectFolder(folder.id)}
                onLongPress={() => handleFolderLongPress(folder)}
              >
                <Ionicons
                  name={isSelected ? 'folder-open' : 'folder'}
                  size={15}
                  color={isSelected ? '#FFF' : colors.primary}
                />
                <Text
                  style={[
                    styles.chipText,
                    { color: isSelected ? '#FFF' : colors.text },
                  ]}
                  numberOfLines={1}
                >
                  {folder.name}
                </Text>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: isSelected
                        ? 'rgba(255,255,255,0.25)'
                        : colors.surfaceHighlight,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      { color: isSelected ? '#FFF' : colors.textMuted },
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}

        {/* Botón "+ Nueva Carpeta" */}
        <Animated.View layout={LinearTransition.springify().damping(15)}>
          <TouchableOpacity
            style={[
              styles.addBtn,
              {
                backgroundColor: colors.surfaceHighlight,
                borderColor: colors.border,
              },
            ]}
            activeOpacity={0.75}
            onPress={openCreateDialog}
          >
            <Ionicons name="add" size={17} color={colors.primary} />
            <Text style={[styles.addBtnText, { color: colors.primary }]}>
              Carpeta
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* Micro-diálogo flotante para Crear/Renombrar Carpeta (Sin Modal nativo) */}
      {modalMode !== null && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={StyleSheet.absoluteFill}
        >
          <Animated.View
            entering={FadeIn.duration(160)}
            exiting={FadeOut.duration(140)}
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100 },
            ]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={closeDialog} />
            <View style={styles.dialogContainer}>
              <Animated.View
                entering={ZoomIn.springify().damping(18)}
                exiting={FadeOut.duration(120)}
                style={[
                  styles.dialogCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.dialogHeader}>
                  <View style={[styles.dialogIconBox, { backgroundColor: colors.surfaceHighlight }]}>
                    <Ionicons name="folder-outline" size={20} color={colors.primary} />
                  </View>
                  <Text style={[styles.dialogTitle, { color: colors.text }]}>
                    {modalMode === 'create' ? 'Nueva Carpeta' : 'Renombrar Carpeta'}
                  </Text>
                </View>

                <TextInput
                  style={[
                    styles.dialogInput,
                    {
                      backgroundColor: colors.surfaceHighlight,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  placeholder="Ej. Vocabulario N5, Expresiones..."
                  placeholderTextColor={colors.textMuted}
                  value={folderNameInput}
                  onChangeText={setFolderNameInput}
                  autoFocus={true}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmitDialog}
                />

                <View style={styles.dialogActions}>
                  <TouchableOpacity
                    style={[styles.dialogBtn, { borderColor: colors.border }]}
                    onPress={closeDialog}
                    disabled={isSubmitting}
                  >
                    <Text style={[styles.dialogBtnCancelText, { color: colors.textMuted }]}>
                      Cancelar
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dialogBtn, styles.dialogBtnPrimary, { backgroundColor: colors.primary }]}
                    onPress={handleSubmitDialog}
                    disabled={isSubmitting}
                  >
                    <Text style={styles.dialogBtnConfirmText}>
                      {modalMode === 'create' ? 'Crear' : 'Guardar'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
    zIndex: 10,
  },
  scrollList: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    ...Shadows.card,
    elevation: 2,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    maxWidth: 120,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
    borderStyle: 'dashed',
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  dialogContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    padding: Spacing.lg,
    borderWidth: 1,
    ...Shadows.card,
    elevation: 8,
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
    marginBottom: 20,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: 10,
  },
  dialogBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  dialogBtnPrimary: {
    borderWidth: 0,
  },
  dialogBtnCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dialogBtnConfirmText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
