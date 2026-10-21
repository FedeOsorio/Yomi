# Plan: Media (Audio, Video e Imágenes) en mazos importados de Anki

## Objetivo
Que un mazo `.apkg` con audio (`[sound:x.mp3]`, `<audio src="x.mp3">`), video (`[sound:x.mp4]`, `<video src="x.mp4">`) e imágenes (`<img src="x.png">`) se importe con todos sus archivos y que la app los reproduzca/muestre adecuadamente:
1. **Como consigna principal (Frente):** Cuando un video, imagen o audio de listening es el estímulo de la tarjeta (sea un mazo temático tipo Pregunta/Respuesta o una tarjeta de listening/sentence-mining de idioma).
2. **Como material complementario (Dorso):** Ilustración del vocabulario, video explicativo o pronunciación nativa.
3. **En el detalle de la palabra y lista del mazo:** Reproducción de audio nativo y miniaturas de imagen.
4. **Degradación controlada:** Si una tarjeta no trae audio propio, o el archivo no existe, se sigue utilizando TTS (`expo-speech`) como fallback transparente.

## Estado actual (punto de partida)
- `lib/anki-importer.ts` lee el `.apkg` entero en base64, lo descomprime completo con `unzipSync` y sólo usa `collection.anki2`. Todos los `[sound:...]` e imágenes HTML se borran (líneas 52, 658, 684 y 694). Los archivos de media nunca se extraen.
- Si una nota de Anki tiene en el frente únicamente un video o imagen (sin texto), al limpiar los tags queda `text = ""` y la línea 711 (`if (text.length > 0)`) **descarta la tarjeta entera**.
- `expo-video` 57.0.5 y `expo-image` 57.0.5 ya están instalados y configurados en `app.json` / `package.json`.
- `expo-audio` **no** está instalado aún.
- `expo-file-system` 57.0.7 ya trae la API nueva (`File`, `Directory`, `Paths`, `FileHandle` con `offset` + `readBytes`), que permite leer partes de un archivo sin cargarlo entero en RAM.
- Todo el audio pasa por `speakText` (`lib/audio-service.ts`), que se llama desde `review.tsx`, `ReviewCard.tsx`, `deck/[id].tsx`, `word/[id].tsx` y `useVoiceReview.ts`.

## Por qué hoy un mazo con media cerraría la app
Para un `.apkg` de 300 MB, la lectura clásica en base64 acumula múltiples copias simultáneas en memoria:

| Paso | Copia en RAM |
|---|---|
| `readAsStringAsync(Base64)`: el lado nativo arma el string base64 | ~400 MB (en Android, dentro del heap de Java, limitado a ~256–512 MB por app) |
| El string cruza el puente a JS (Hermes) | ~400–800 MB |
| `base64ToUint8Array` | +300 MB |
| `unzipSync` descomprime **todas** las entradas | +~300 MB |

El pico supera 1 GB y Android fuerza el cierre (`OutOfMemoryError` / lowmemorykiller).

**Solución:** Leer el zip por bloques con `FileHandle`, de a un archivo por vez. El pico de memoria queda acotado al tamaño del archivo individual más grande (un audio pesa ~50 KB, una imagen ~200 KB y un video unos pocos MB).

---

## Fase 1 — Lector de zip por partes (sin dependencias nativas nuevas)

**Archivo nuevo: `lib/zip-reader.ts`**, desacoplado de la UI.

```ts
export interface ZipEntry {
  name: string;
  method: 0 | 8;           // 0 = stored, 8 = deflate
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
  crc32: number;
}

export function openZip(uri: string): {
  entries: Map<string, ZipEntry>;
  hasEntry(name: string): boolean;
  readEntry(e: ZipEntry): Uint8Array;
  extractEntryToFile(e: ZipEntry, destUri: string): void;
  close(): void;
};
```

1. `new File(uri).open(FileMode.ReadOnly)` devuelve un `FileHandle`. Se leen los últimos `min(size, 65 557)` bytes y se busca hacia atrás la firma EOCD `0x06054b50`. De ahí salen la cantidad de entradas, el tamaño del central directory y su offset.
2. Se lee **únicamente** el central directory (≈80 bytes por entrada: 5.000 archivos ≈ 400 KB) y se puebla el `Map<name, ZipEntry>`.
3. `readEntry`: va a `localHeaderOffset`, lee el header local (30 bytes), saltea `nameLen + extraLen`, lee `compressedSize` bytes y descomprime con `inflateSync` de fflate (ya instalado) si `method === 8`.
4. **Streaming para archivos grandes (> 8 MB, videos):** `extractEntryToFile(e, destUri)` lee bloques de 1 MB, los pasa a `new Inflate((chunk) => destHandle.writeBytes(chunk))` y escribe secuencialmente al archivo de destino. La memoria se mantiene en ~2 MB constantes.
5. `close()` siempre en `finally`.
6. **Formato nuevo de Anki 2.1.50+ (`anki21b`), soportado sin pedirle nada al usuario** (`lib/anki-collection.ts` + `extractAnkiPackageAsync`):
   - Prioridad de base: `collection.anki21b` → `collection.anki21` → `collection.anki2` (en los formatos nuevos, `anki2` es una nota de relleno).
   - La base, el índice `media` y cada archivo de media vienen comprimidos con zstd (`fzstd`, JS puro). Los archivos se descomprimen por bloques al extraerlos (`extractEntryToFile(…, { zstd: true })`).
   - El índice `media` es un protobuf `MediaEntries`; la entrada del zip de cada archivo es su posición ("0", "1"…).
   - Esquema v18: los nombres de campo están en la tabla `fields` y los mazos en `decks` (los anidados como `Padre\x1fHijo`), no en `col.models` / `col.decks`.
   - Esas tablas declaran `COLLATE unicase`, que sólo existe dentro de Anki: en la copia que se lee se reemplaza por `nocase` (mismo largo en bytes) antes de abrirla.
7. **Elección de campos por palabras del nombre**, no por nombre exacto: "VocabDefEsp" → vocab/def/esp → significado en español; "Word Reading" → lectura; "SentAudio" → audio de oración. Entre varios significados se prefiere el del idioma del usuario. Probado con Kaishi 1.5k (formato nuevo) y Core 2.3k Español (clásico).

---

## Fase 2 — Detección y registro de media (Audio, Video e Imágenes)

**`lib/anki-importer.ts`**

1. Leer la entrada `media` del zip: JSON `{"0": "neko.mp3", "1": "clip.mp4", "2": "esquema.png"}`. Invertir a `Map<nombreReal, entradaZip>`.
2. Por cada nota, **antes** de ejecutar `cleanHtmlAndAnkiTags`, extraer de cada campo:
   - `\[sound:(.+?)\]`
   - `<(audio|video)[^>]+src=["']([^"']+)["']`
   - `<img[^>]+src=["']([^"']+)["']`
3. Normalizar nombres: `trim()`, decodificar entidades HTML / URL encoding (`decodeURIComponent`), y aplicar `.normalize('NFC')`.
4. Clasificar extensiones:
   - Audio: `mp3 ogg oga opus m4a aac wav flac`
   - Video: `mp4 webm mov mkv m4v`
   - Imagen: `png jpg jpeg webp gif svg`
5. Nuevo tipo universal en `ParsedVocabularyItem`:
   ```ts
   export interface MediaRef {
     file: string;                     // "clip.mp4", "diagrama.png", "neko.mp3"
     kind: 'audio' | 'video' | 'image';
     side: 'front' | 'back';           // 'front' si proviene del campo de consigna; si no, 'back'
     role?: 'prompt' | 'word' | 'sentence'; // 'prompt' cuando es la consigna visual/auditiva principal
   }
   ```
6. **Manejo de tarjetas donde la media es la consigna:**
   - Si tras extraer la media el campo frontal queda vacío de texto (o sólo contenía `[sound:...]` / `<img>`), **NO descartar la tarjeta**.
   - Asignar `text = '[Video]'`, `text = '[Imagen]'` o `text = '[Audio]'` como texto base de la tarjeta para SQLite.
   - Marcar el recurso multimedia frontal con `side: 'front'` y `role: 'prompt'`.
7. **Reglas de asignación `role` y `side`:**
   - En mazos de idiomas:
     - El audio de la palabra (campo `Audio`, `Word Audio`, `Sound`) se asocia a la palabra en general (reproducible tanto en frente como en dorso).
     - El audio del campo de ejemplo/oración se marca con `role: 'sentence'`.
     - Las imágenes del campo de ilustración se marcan por defecto en el dorso (`side: 'back'`), salvo que vengan en el campo de texto frontal.
   - En mazos custom / Q&A:
     - Lo que provenga de la pregunta es `side: 'front'` (`role: 'prompt'`).
     - Lo que provenga de la respuesta es `side: 'back'`.
8. En esta fase **no se extraen archivos a disco**: sólo se calcula el manifiesto:
   ```ts
   media: {
     byFile: Map<string, ZipEntry>;
     audioCount: number;
     videoCount: number;
     imageCount: number;
     totalBytes: number;
     missing: string[];
   };
   ```

---

## Fase 3 — Guardar los archivos al confirmar la importación

**Ubicación: Directorio global `Paths.document/media/`**
- Sanitizar nombres de archivo: reemplazar caracteres inválidos `/ \ : * ? " < > |` por `_`.
- **Deduplicación optimizada por contenido (MD5):**
  - Si `new File(Paths.document, 'media', targetName).exists` es `false`: se escribe directamente en la ruta final (caso común para la gran mayoría de archivos).
  - Si ya existe un archivo con ese nombre: se escribe el nuevo a un archivo temporal y se compara `file.info({ md5: true })`.
    - Si el MD5 coincide: se borra el temporal y se reutiliza el existente.
    - Si el MD5 es distinto: se renombra a `nombre-<md5 8 caracteres>.ext`.
- En `auxiliary_info` se guardan rutas **relativas** (`media/clip.mp4`), garantizando portabilidad frente a cambios de sandbox en iOS.
- **Limpieza de caché:** En un bloque `finally`, borrar siempre la copia temporal del `.apkg` en `Paths.cache` creada por `DocumentPicker`.

**`lib/word-aux.ts`**
- Agregar `media?: Array<MediaRef & { path: string }>` al tipo `WordAux`.

**`lib/word-service.ts`**
- Actualizar `saveBatchWords` y `saveBatchCustomCards` para admitir `media` en los ítems y persistirlos en `auxiliaryInfo`.
- Devolver `insertedMedia: Set<string>` para identificar los archivos que efectivamente quedaron asociados a tarjetas nuevas.

**Función de extracción en `lib/anki-importer.ts`:**
```ts
export async function importAnkiMediaAsync(
  fileUri: string,
  filesToExtract: string[],
  manifest: Map<string, ZipEntry>,
  onProgress?: (done: number, total: number) => void
): Promise<{ paths: Map<string, string>; written: number; reused: number; failed: string[] }>;
```
- Verificar espacio libre previo con `Paths.availableDiskSpace` (+ 10% margen).
- Ceder el hilo de JS cada ~20 archivos (`await new Promise(requestAnimationFrame)`) y actualizar progreso.

**UI en `src/app/deck/import.tsx`**
- Vista previa enriquecida: "🔊 230 audios · 🎬 15 videos · 🖼️ 450 imágenes · 58 MB".
- Barra de progreso animada con Reanimated durante la extracción.

---

## Fase 4 — Reproducción y visualización en el repaso

### 1. Dependencia de audio
- Instalar `npx expo install expo-audio` (requiere build nativo nuevo; no compatible con OTA puro).

### 2. Servicio multimedia: `lib/media-service.ts`
```ts
export function resolveMediaUri(path: string): string | null;
export function getCardAudio(aux: WordAux, side?: 'front' | 'back'): string | null;
export function getCardSentenceAudio(aux: WordAux): string | null;
export function getCardVideos(aux: WordAux, side?: 'front' | 'back'): string[];
export function getCardImages(aux: WordAux, side?: 'front' | 'back'): string[];
export async function playMediaAudio(path: string, opts?: SpeakOptions): Promise<boolean>;
export function stopMediaAudio(): void;
```
- Instancia única de `AudioPlayer` reutilizada con `player.replace({ uri })`.
- `setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })` para respetar sonido en silencio en iOS sin bloquear el micrófono de reconocimiento de voz.
- Compatibilidad de formatos: en iOS, filtrar extensiones no soportadas por AVPlayer (`ogg`, `opus`, `webm`, `mkv`) y derivar automáticamente a TTS.

### 3. Punto de entrada unificado en `lib/audio-service.ts`
```ts
export async function speakCard(
  card: { displayText: string; displayReading?: string; auxiliaryInfo?: string | null },
  languageCode: string,
  opts?: SpeakOptions & { side?: 'front' | 'back'; reading?: string; role?: 'word' | 'sentence' }
): Promise<void>;
```
- Si existe archivo de audio válido (`getCardAudio` / `getCardSentenceAudio`) y se reproduce con éxito, finaliza. Si no hay archivo o falla, fallback a `speakText(...)`.
- `stopSpeech()` detiene tanto el sintetizador TTS como `stopMediaAudio()`.

### 4. Componentes visuales
- **Video: `src/components/media/CardVideo.tsx`**:
  - Utiliza `useVideoPlayer` y `VideoView` de `expo-video`.
  - Se monta **únicamente cuando la cara correspondiente está visible** (`isChecked` en dorso, o `side === 'front'` en frente).
  - Se pausa y libera automáticamente al cambiar de tarjeta o desmontarse.
- **Imágenes: `src/components/media/CardImage.tsx`**:
  - Utiliza `<Image source={{ uri }} contentFit="contain" />` de `expo-image`.
  - Soporte de apertura a pantalla completa con zoom opcional al tocar la imagen.

### 5. Integración en `ReviewCard.tsx` y `review.tsx`
- **Frente con consigna multimedia (`role === 'prompt'` o `side === 'front'`):**
  - Si la tarjeta trae video frontal: renderizar `<CardVideo>` en lugar destacado como estímulo principal.
  - Si trae imagen frontal: renderizar `<CardImage>` encima o en lugar del texto.
  - Si trae audio frontal de listening: botón animado de reproducción automática.
- **Dorso:**
  - Mostrar imágenes complementarias y videos de respuesta debajo de los significados.
  - Si existe audio de oración (`role === 'sentence'`), mostrar botón de parlante dedicado junto a la oración de ejemplo.
- **Coordinación con Repaso por Voz (`useVoiceReview.ts`):**
  - Antes de encender el micrófono de Sherpa-ONNX o nativo, invocar `stopMediaAudio()`.
  - Al voltear la tarjeta tras un acierto, reproducir el audio nativo con `speakCard`.
  - El temporizador de auto-avance (`autoAdvance`) debe esperar a que el audio termine (`onDone`) o respetar la duración del audio antes de pasar de tarjeta.

---

## Fase 5 — Limpieza y consistencia (`cleanOrphanMedia`)

- **`lib/data-repair.ts`**:
  - `cleanOrphanMedia()`: escanea la carpeta `media/`, consulta todas las referencias en `words.auxiliary_info` y traslada a `media/.trash/` los archivos no referenciados.
  - La papelera se purga automáticamente tras 30 días o mediante un botón *"Liberar espacio de multimedia"* en Configuración.
  - **Cuándo se ejecuta:**
    - Al finalizar la eliminación de un mazo (`deleteDeck`).
    - Al terminar una importación con archivos omitidos o cancelados.
    - Como tarea manual en Configuración.
    - **NO** se corre en cada `deleteWord` individual (para evitar I/O masivo innecesario) ni tras restaurar un backup.

---

## Fase 6 — Copias de seguridad e integridad

- **Google Drive:** No se suben archivos pesados de media a la nube. Sólo se respaldan las rutas relativas en `auxiliary_info` (ya soportado en `lib/backup-service.ts`).
- **Nueva columna en tabla `decks`:**
  - `media_source`: texto JSON con metadata del archivo original: `{ file: 'deck.apkg', size: number, importedAt: string, mediaCount: number }`.
  - Requiere migración de Drizzle en `db/migrations/` y actualización de `db/schema.ts`.
- **Restauración asistida:**
  - Si se restaura un backup en un dispositivo nuevo o limpio, la app muestra en la pantalla del mazo el botón *"Recuperar media del mazo"* si detecta archivos faltantes.
  - El usuario selecciona su archivo `.apkg` original y se ejecuta `importAnkiMediaAsync` únicamente para los archivos faltantes, sin alterar el progreso SRS existente.

---

## Archivos involucrados

- **Nuevos:**
  - `lib/zip-reader.ts`
  - `lib/media-service.ts` (utilidades de media: tipos, rutas, nombres, reproducción)
  - `lib/anki-import-service.ts` (único flujo de importación .apkg con media, usado por la pantalla y "Abrir con Yomi", y la recuperación de media)
  - `lib/anki-collection.ts` (análisis puro de la colección: campos, lecturas, media, índice de media y zstd; se puede probar en Node)
  - `lib/media-types.ts` (utilidades de media sin dependencias nativas)
  - `src/components/media/CardVideo.tsx`
  - `src/components/media/CardImage.tsx`
- **Modificados:**
  - `lib/anki-importer.ts`
  - `lib/word-aux.ts`
  - `lib/word-service.ts`
  - `lib/audio-service.ts`
  - `lib/deck-service.ts`
  - `lib/data-repair.ts`
  - `db/schema.ts` y migraciones en `db/migrations/`
  - `src/app/deck/import.tsx`
  - `src/app/deck/[id].tsx`
  - `src/app/word/[id].tsx`
  - `src/components/review/ReviewCard.tsx`
  - `src/app/(tabs)/review.tsx`
  - `src/hooks/review/useVoiceReview.ts`
  - `src/i18n/locales/*` y `src/i18n/types.ts`
  - `package.json` y `app.json` (instalación de `expo-audio`)
