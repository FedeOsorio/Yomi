/**
 * Servicio unificado de resolución y reproducción de multimedia (Audio, Video e Imágenes).
 *
 * Administra el ciclo de vida del AudioPlayer nativo de expo-audio, garantiza que
 * el audio mode no interfiera con el reconocimiento de voz de Sherpa-ONNX,
 * y resuelve rutas relativas hacia Paths.document/media/.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { WordAux, MediaItem } from './word-aux';

export type MediaKind = MediaItem['kind'];
type MediaSide = MediaItem['side'];

export interface SpeakOptions {
  onStart?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (err: any) => void;
}

/** Carpeta (dentro de Paths.document) donde viven todos los archivos importados, como `collection.media` de Anki. */
export const MEDIA_DIR = 'media';

const EXTENSIONS: Record<MediaKind, Set<string>> = {
  audio: new Set(['mp3', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'wav', 'flac']),
  video: new Set(['mp4', 'webm', 'mov', 'mkv', 'm4v']),
  image: new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']),
};

/** Formatos que AVPlayer (iOS) no reproduce: el audio cae a TTS y el video no se muestra. */
const IOS_UNSUPPORTED = new Set(['ogg', 'oga', 'opus', 'webm', 'mkv']);

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

export function isPlayableOnPlatform(fileName: string): boolean {
  return Platform.OS !== 'ios' || !IOS_UNSUPPORTED.has(getExtension(fileName));
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

/** Carpeta `media/`, creada si todavía no existe. */
export function getMediaDir(): Directory {
  const dir = new Directory(Paths.document, MEDIA_DIR);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Nombres de los archivos que hay hoy en `media/` (una sola lectura del directorio). */
export function listMediaFiles(): Set<string> {
  const names = new Set<string>();
  try {
    const dir = new Directory(Paths.document, MEDIA_DIR);
    if (!dir.exists) return names;
    for (const entry of dir.list()) {
      if (entry instanceof File) names.add(entry.name);
    }
  } catch (e) {
    console.warn('[MediaService] Error listando media:', e);
  }
  return names;
}

/** Borra un archivo si existe, sin lanzar (copias temporales en caché). */
export function deleteFileQuietly(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}

/**
 * Resuelve una ruta relativa almacenada en la base de datos (ej: "media/neko.mp3")
 * hacia una URI nativa válida (file://...). Devuelve null si el archivo no existe físicamente.
 */
export function resolveMediaUri(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  try {
    const file = new File(Paths.document, relativePath);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

type MediaPick = (m: MediaItem) => boolean;
const onSide = (side: MediaSide, role?: MediaItem['role']): MediaPick => (m) =>
  m.side === side && (!role || m.role === role);
const withRole = (role: MediaItem['role']): MediaPick => (m) => m.role === role;

/**
 * Orden en que se busca el audio principal según el lado pedido. En el dorso, si no hay audio propio,
 * se usa el del frente (ej: 猫[sound:neko.mp3] en el campo de la palabra): la tarjeta ya giró.
 */
const AUDIO_PRIORITY: Record<MediaSide | 'any', MediaPick[]> = {
  front: [onSide('front', 'prompt'), onSide('front', 'word'), onSide('front')],
  back: [onSide('back', 'word'), onSide('back'), onSide('front', 'word'), onSide('front')],
  any: [withRole('word'), withRole('prompt'), () => true],
};

/** URI del primer archivo que cumple el primer criterio posible y existe en disco. */
function firstExistingUri(items: MediaItem[], picks: MediaPick[]): string | null {
  for (const pick of picks) {
    for (const m of items) {
      if (!pick(m)) continue;
      const uri = resolveMediaUri(m.path);
      if (uri) return uri;
    }
  }
  return null;
}

function playableMedia(aux: WordAux | null | undefined, kind: MediaKind): MediaItem[] {
  return (aux?.media ?? []).filter((m) => m.kind === kind && isPlayableOnPlatform(m.file));
}

/**
 * URI del audio principal de la tarjeta. Nunca devuelve el de la oración de ejemplo
 * (para eso está getCardSentenceAudio).
 */
export function getCardAudio(aux: WordAux | null | undefined, side?: MediaSide): string | null {
  const audios = playableMedia(aux, 'audio').filter((m) => m.role !== 'sentence');
  return firstExistingUri(audios, AUDIO_PRIORITY[side ?? 'any']);
}

/** URI del audio de la oración de ejemplo (role === 'sentence'). */
export function getCardSentenceAudio(aux: WordAux | null | undefined): string | null {
  return firstExistingUri(playableMedia(aux, 'audio'), [withRole('sentence')]);
}

/** URIs de los videos o imágenes de la tarjeta (de un lado, o de los dos). */
export function getCardMediaUris(
  aux: WordAux | null | undefined,
  kind: 'video' | 'image',
  side?: MediaSide
): string[] {
  return playableMedia(aux, kind)
    .filter((m) => !side || m.side === side)
    .map((m) => resolveMediaUri(m.path))
    .filter((uri): uri is string => Boolean(uri));
}

let activePlayer: any = null;
let activeSubscription: any = null;
let activeOptions: SpeakOptions | null = null;
let isAudioModeConfigured = false;

/**
 * expo-audio es un módulo nativo nuevo: se carga recién al reproducir, así un binario
 * anterior que reciba este JS por OTA no se rompe al abrir la app (solo cae a TTS).
 */
function loadExpoAudio(): typeof import('expo-audio') {
  return require('expo-audio');
}

/**
 * Configura el modo de audio global una sola vez para que suene con el switch de silencio activado en iOS,
 * manteniendo allowsRecording en false para no competir con el motor de voz Sherpa-ONNX.
 */
async function ensureAudioModeAsync(): Promise<void> {
  if (isAudioModeConfigured) return;
  try {
    await loadExpoAudio().setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
    });
    isAudioModeConfigured = true;
  } catch (e) {
    console.warn('[MediaService] Error configurando audio mode:', e);
  }
}

/**
 * Reproduce un archivo de audio (URI ya resuelta por getCardAudio / getCardSentenceAudio).
 * Devuelve false si no se pudo iniciar: en ese caso no avisa nada y el que llama usa TTS.
 */
export async function playMediaAudio(uri: string, opts?: SpeakOptions): Promise<boolean> {
  stopMediaAudio();
  try {
    await ensureAudioModeAsync();
    const player = loadExpoAudio().createAudioPlayer({ uri });
    activePlayer = player;
    activeOptions = opts ?? null;

    // Al terminar (bien o mal) se libera el reproductor sin disparar onStopped: avisa solo cb.
    const finish = (cb?: () => void) => {
      activeOptions = null;
      stopMediaAudio();
      cb?.();
    };

    activeSubscription = player.addListener('playbackStatusUpdate', (status: any) => {
      if (status?.error) {
        console.warn('[MediaService] Error en reproducción de audio:', status.error);
        finish(() => opts?.onError?.(new Error(String(status.error))));
      } else if (status?.didJustFinish) {
        finish(opts?.onDone);
      }
    });

    opts?.onStart?.();
    player.play();
    return true;
  } catch (err) {
    console.warn('[MediaService] Error al reproducir audio nativo:', err);
    activeOptions = null;
    stopMediaAudio();
    return false;
  }
}

/**
 * Detiene inmediatamente cualquier reproducción de audio multimedia activa y libera el reproductor.
 */
export function stopMediaAudio(): void {
  const prevOpts = activeOptions;
  activeOptions = null;

  if (activeSubscription) {
    try {
      activeSubscription.remove();
    } catch {}
    activeSubscription = null;
  }
  if (activePlayer) {
    try {
      activePlayer.pause();
      activePlayer.remove();
    } catch {}
    activePlayer = null;
  }

  prevOpts?.onStopped?.();
}
