import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Folder } from '../../../lib/deck-service';
import { useTheme } from '../../../providers/ThemeProvider';
import { Spacing } from '../../constants/theme';
import { useTranslation } from '../../i18n';
import { BottomSheet } from './BottomSheet';

interface FolderActionsSheetProps {
  folder: Folder | null;
  onClose: () => void;
  onEdit: (folder: Folder) => void;
  onNewSubfolder: (folder: Folder) => void;
  onMove: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
}

/** Opciones de una carpeta (mantener presionada en el inicio, o "⋯" en Administrar carpetas). */
export function FolderActionsSheet({ folder, onClose, onEdit, onNewSubfolder, onMove, onDelete }: FolderActionsSheetProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const color = folder?.color || colors.primary;

  const options = [
    { icon: 'create-outline' as const, label: t('folders.editFolder'), action: onEdit, tint: colors.text },
    { icon: 'folder-open-outline' as const, label: t('folders.newSubfolder'), action: onNewSubfolder, tint: colors.text },
    { icon: 'arrow-redo-outline' as const, label: t('folders.moveFolder'), action: onMove, tint: colors.text },
    { icon: 'trash-outline' as const, label: t('folders.deleteFolder'), action: onDelete, tint: colors.danger },
  ];

  return (
    <BottomSheet visible={folder !== null} onClose={onClose}>
      {folder && (
        <>
          <View style={styles.header}>
            <View style={[styles.iconBox, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
              <Ionicons name="folder" size={20} color={color} />
            </View>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {folder.name}
            </Text>
          </View>
          {options.map((o, i) => (
            <TouchableOpacity
              key={o.label}
              style={[styles.option, i < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
              activeOpacity={0.7}
              onPress={() => {
                onClose();
                o.action(folder);
              }}
            >
              <Ionicons name={o.icon} size={21} color={o.tint === colors.danger ? colors.danger : colors.textMuted} />
              <Text style={[styles.optionText, { color: o.tint }]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.sm,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
  },
  optionText: {
    fontSize: 15.5,
    fontWeight: '600',
  },
});
