# Caso de Uso: Gestión de Mazos Multidioma y Reconocimiento Fonético

## Descripción
Permite al usuario crear y organizar sus mazos según el idioma de estudio, con reconocimiento automático a partir de lo que el usuario sabe (Pinyin en Chino, Romaji/Kana en Japonés, o palabras directas en otros idiomas) sin necesidad de rellenar manualmente formularios complejos. El sistema reconoce la palabra, consulta el diccionario, traduce el significado al español y permite guardarla con un solo tap, reproduciendo el audio en la voz nativa del idioma.

## Actores
- Usuario que aprende uno o más idiomas (Chino, Japonés, Inglés, Español, etc.).

## Precondiciones
- La base de datos SQLite y las funciones de búsqueda multidioma están disponibles.

## Flujo Principal
1. **Reconocimiento Fonético en Japonés (`ja-JP`)**:
   - El usuario escribe en la barra lo que sabe (ej. `hon`, `arigatou`, `taberu` o el kanji `本`).
   - `lib/japanese-utils.ts` convierte Romaji a Hiragana (`hon` $\rightarrow$ `ほん`).
   - `lib/japanese-search.ts` consulta el diccionario estructurado, traduce las definiciones al español y devuelve las tarjetas candidatas (**本** • `ほん (hon)` • *libro, origen*).
   - El usuario pulsa **+** en cualquier tarjeta y se guarda en el mazo con 1 solo tap.
2. **Reconocimiento Fonético en Chino (`zh-CN`)**:
   - El usuario escribe Pinyin (ej. `xihuan`).
   - El motor busca coincidencias exactas en CC-CEDICT o abre el constructor de caracteres por sílabas.
   - Se guarda con 1 tap.
3. **Pronunciación Nativa**:
   - `lib/audio-service.ts` selecciona dinámicamente el motor de voz nativo instalado (`ja-JP` para japonés, `zh-CN` para chino, `en-US` para inglés), garantizando que el audio suene en el idioma correcto y nunca en el idioma por defecto del sistema.

## Archivos Involucrados
- `src/app/search.tsx` — Pantalla de reconocimiento automático y búsqueda.
- `lib/japanese-utils.ts` — Conversión Romaji $\rightarrow$ Hiragana.
- `lib/japanese-search.ts` — Búsqueda estructurada y traducción de definiciones al español.
- `lib/audio-service.ts` — Resolución dinámica de voces nativas para TTS.
- `lib/deck-service.ts` — Gestión de mazos multidioma.
- `lib/word-service.ts` — Persistencia de tarjetas y estados SRS.
