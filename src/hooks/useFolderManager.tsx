import { useState } from 'react';
import { Alert } from 'react-native';
import { notifyDataChanged } from '../../lib/backup-service';
import {
  assignDeckToFolder,
  createFolder,
  deleteFolder,
  Folder,
  moveFolder,
  renameFolder,
} from '../../lib/deck-service';
import { getDescendantIds } from '../../lib/folder-tree';
import { FolderActionsSheet } from '../components/folders/FolderActionsSheet';
import { FolderDialog } from '../components/folders/FolderDialog';
import { FolderPickerModal } from '../components/folders/FolderPickerModal';
import { useTranslation } from '../i18n';

type DialogState = { mode: 'create'; parentId: string | null } | { mode: 'edit'; folder: Folder } | null;
type PickerState =
  | { kind: 'folder'; folder: Folder }
  | { kind: 'deck'; deck: { id: string; name: string; folderId?: string | null } }
  | null;

/**
 * Todas las acciones sobre carpetas (crear, editar, mover, eliminar, mover mazos) con sus modales.
 * La usan el inicio y Administrar carpetas: renderizar `modals` y llamar a las funciones `open…`.
 * Cada cambio avisa con notifyDataChanged() para que las pantallas recarguen.
 */
export function useFolderManager(folders: Folder[], options: { onFolderDeleted?: (folder: Folder) => void } = {}) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [actionsFor, setActionsFor] = useState<Folder | null>(null);
  const [picker, setPicker] = useState<PickerState>(null);

  const nameOf = (id: string | null | undefined) => folders.find((f) => f.id === id)?.name ?? null;

  const confirmDelete = (folder: Folder) => {
    Alert.alert(t('folders.deleteFolder'), t('folders.deleteFolderNotice', { name: folder.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFolder(folder.id);
            options.onFolderDeleted?.(folder);
            notifyDataChanged();
          } catch {
            Alert.alert(t('common.error'), t('folders.deleteFolderError'));
          }
        },
      },
    ]);
  };

  const handlePick = async (targetId: string | null) => {
    const current = picker;
    setPicker(null);
    if (!current) return;
    try {
      if (current.kind === 'folder') await moveFolder(current.folder.id, targetId);
      else await assignDeckToFolder(current.deck.id, targetId);
      notifyDataChanged();
    } catch {
      Alert.alert(t('common.error'), t('folders.moveError'));
    }
  };

  const editing = dialog?.mode === 'edit' ? dialog.folder : null;

  const modals = (
    <>
      <FolderDialog
        visible={dialog !== null}
        mode={dialog?.mode ?? 'create'}
        initialName={editing?.name}
        initialColor={editing?.color}
        parentName={dialog?.mode === 'create' ? nameOf(dialog.parentId) : null}
        onClose={() => setDialog(null)}
        onSubmit={async (name, color) => {
          if (!dialog) return;
          if (dialog.mode === 'create') await createFolder(name, color, dialog.parentId);
          else await renameFolder(dialog.folder.id, name, color);
          notifyDataChanged();
        }}
      />

      <FolderActionsSheet
        folder={actionsFor}
        onClose={() => setActionsFor(null)}
        onEdit={(folder) => setDialog({ mode: 'edit', folder })}
        onNewSubfolder={(folder) => setDialog({ mode: 'create', parentId: folder.id })}
        onMove={(folder) => setPicker({ kind: 'folder', folder })}
        onDelete={confirmDelete}
      />

      <FolderPickerModal
        visible={picker !== null}
        title={picker?.kind === 'deck' ? t('decks.moveDeckTitle') : t('folders.moveFolderTitle')}
        subtitle={picker?.kind === 'deck' ? picker.deck.name : picker?.folder.name}
        folders={folders}
        currentId={picker?.kind === 'deck' ? picker.deck.folderId ?? null : picker?.folder.parentId ?? null}
        disabledIds={
          picker?.kind === 'folder'
            ? new Set([picker.folder.id, ...getDescendantIds(folders, picker.folder.id)])
            : undefined
        }
        onSelect={handlePick}
        onClose={() => setPicker(null)}
      />
    </>
  );

  return {
    /** Crear carpeta dentro de `parentId` (null = Inicio). */
    openCreate: (parentId: string | null) => setDialog({ mode: 'create', parentId }),
    /** Menú de opciones de una carpeta. */
    openActions: (folder: Folder) => setActionsFor(folder),
    /** Elegir a qué carpeta mover un mazo. */
    openMoveDeck: (deck: { id: string; name: string; folderId?: string | null }) => setPicker({ kind: 'deck', deck }),
    modals,
  };
}
