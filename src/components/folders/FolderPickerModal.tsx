import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Folder } from '../../../lib/deck-service';
import { flattenFolderTree } from '../../../lib/folder-tree';
import { useTheme } from '../../../providers/ThemeProvider';
import { Spacing } from '../../constants/theme';
import { useTranslation } from '../../i18n';
import { BottomSheet } from './BottomSheet';

interface FolderPickerModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  folders: Folder[];
  /** Ubicación actual (null = Inicio): se marca con un tilde. */
  currentId: string | null;
  /** Carpetas que no se pueden elegir (p. ej. la propia carpeta y sus subcarpetas). */
  disabledIds?: Set<string>;
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
}

/** Elegir un destino en el árbol de carpetas (Inicio + todas las carpetas con sangría). */
export function FolderPickerModal({ visible, title, subtitle, folders, currentId, disabledIds, onSelect, onClose }: FolderPickerModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const tree = useMemo(() => flattenFolderTree(folders), [folders]);

  const row = (key: string, id: string | null, label: string, icon: 'home' | 'folder', tint: string, depth: number) => {
    const disabled = id !== null && !!disabledIds?.has(id);
    const isCurrent = id === currentId;
    return (
      <TouchableOpacity
        key={key}
        disabled={disabled}
        activeOpacity={0.7}
        onPress={() => (isCurrent ? onClose() : onSelect(id))}
        style={[
          styles.row,
          { paddingLeft: 12 + depth * 18, opacity: disabled ? 0.35 : 1 },
          isCurrent && { backgroundColor: colors.surfaceHighlight },
        ]}
      >
        {depth > 0 && <View style={[styles.guide, { left: depth * 18 - 2, backgroundColor: colors.border }]} />}
        <Ionicons name={icon} size={18} color={tint} />
        <Text style={[styles.rowText, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        {isCurrent && <Ionicons name="checkmark" size={18} color={colors.primary} />}
      </TouchableOpacity>
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {row('root', null, t('folders.home'), 'home', colors.textMuted, 0)}
        {tree.map(({ folder, depth }) =>
          row(folder.id, folder.id, folder.name, 'folder', folder.color || colors.primary, depth + 1)
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13.5,
    marginTop: 2,
  },
  list: {
    marginTop: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingRight: 12,
    borderRadius: 12,
  },
  guide: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth * 2,
  },
  rowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
});
