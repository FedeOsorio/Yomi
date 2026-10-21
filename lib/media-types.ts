/**
 * Utilidades de media sin dependencias nativas (tipos de archivo, nombres y rutas).
 * Las usa el análisis de mazos de Anki, que tiene que poder correr fuera de la app (pruebas en Node).
 * El resto de la app las importa desde media-service, que las re-exporta.
 */

import type { MediaItem } from './word-aux';

export type MediaKind = MediaItem['kind'];

/** Carpeta (dentro de Paths.document) donde viven todos los archivos importados, como `collection.media` de Anki. */
export const MEDIA_DIR = 'media';

const EXTENSIONS: Record<MediaKind, Set<string>> = {
  audio: new Set(['mp3', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'wav', 'flac']),
  video: new Set(['mp4', 'webm', 'mov', 'mkv', 'm4v']),
  image: new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']),
};

/** Texto que se pone a una tarjeta cuyo frente era sólo un archivo, para no descartarla. */
export const MEDIA_PLACEHOLDERS: Record<MediaKind, string> = {
  audio: '[Audio]',
  video: '[Video]',
  image: '[Imagen]',
};

export function isMediaPlaceholder(text: string | null | undefined): boolean {
  return /^\[(Audio|Video|Imagen)\]$/i.test((text || '').trim());
}

export function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

export function getMediaKind(fileName: string): MediaKind | null {
  const ext = getExtension(fileName);
  return (Object.keys(EXTENSIONS) as MediaKind[]).find((kind) => EXTENSIONS[kind].has(ext)) ?? null;
}

/** Nombre de archivo válido en disco (conserva la extensión). */
export function sanitizeMediaName(fileName: string): string {
  return fileName.replace(/[/\\:*?"<>|]/g, '_').trim();
}

/** "media/neko.mp3" -> "neko.mp3" */
export function mediaFileName(path: string): string {
  return path.replace(/^media\//, '').trim();
}

/** "neko.mp3" -> "media/neko.mp3" (lo que se guarda en `MediaItem.path`) */
export function mediaPath(fileName: string): string {
  return `${MEDIA_DIR}/${fileName}`;
}
