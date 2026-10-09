/**
 * Utilidades puras para el árbol de carpetas (sin base de datos: se pueden probar sueltas).
 * Una carpeta con parentId null está en Inicio.
 */
export interface FolderNode {
  id: string;
  name: string;
  parentId?: string | null;
}

/** Carpetas hijas directas de `parentId` (null = Inicio), en el orden recibido. */
export function getChildFolders<T extends FolderNode>(folders: T[], parentId: string | null): T[] {
  return folders.filter((f) => (f.parentId ?? null) === parentId);
}

/** Ruta desde Inicio hasta la carpeta (incluida). Vacía si no existe. */
export function getFolderPath<T extends FolderNode>(folders: T[], folderId: string | null): T[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: T[] = [];
  const seen = new Set<string>();
  let current = folderId ? byId.get(folderId) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Ids de todas las carpetas que cuelgan de `folderId` (sin incluirla). */
export function getDescendantIds(folders: FolderNode[], folderId: string): Set<string> {
  const result = new Set<string>();
  const stack = [folderId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const f of folders) {
      if (f.parentId === id && !result.has(f.id) && f.id !== folderId) {
        result.add(f.id);
        stack.push(f.id);
      }
    }
  }
  return result;
}

/** ¿Se puede mover `folderId` dentro de `newParentId`? (no dentro de sí misma ni de una subcarpeta suya) */
export function canMoveFolder(folders: FolderNode[], folderId: string, newParentId: string | null): boolean {
  if (newParentId === null) return true;
  if (newParentId === folderId) return false;
  return !getDescendantIds(folders, folderId).has(newParentId);
}

/** Árbol aplanado en orden de lectura, con la profundidad de cada carpeta (para listas con sangría). */
export function flattenFolderTree<T extends FolderNode>(folders: T[]): { folder: T; depth: number }[] {
  const out: { folder: T; depth: number }[] = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const f of getChildFolders(folders, parentId)) {
      if (visited.has(f.id)) continue;
      visited.add(f.id);
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  // Carpetas con un padre inexistente: se muestran en Inicio para no perderlas.
  for (const f of folders) {
    if (!visited.has(f.id)) {
      visited.add(f.id);
      out.push({ folder: f, depth: 0 });
      walk(f.id, 1);
    }
  }
  return out;
}

/** Cantidad de mazos dentro de cada carpeta, contando también los de sus subcarpetas. */
export function countDecksRecursive(
  folders: FolderNode[],
  decks: { folderId?: string | null }[]
): Record<string, number> {
  const direct: Record<string, number> = {};
  for (const d of decks) {
    if (d.folderId) direct[d.folderId] = (direct[d.folderId] || 0) + 1;
  }
  const totals: Record<string, number> = {};
  for (const f of folders) {
    let total = direct[f.id] || 0;
    getDescendantIds(folders, f.id).forEach((id) => (total += direct[id] || 0));
    totals[f.id] = total;
  }
  return totals;
}
