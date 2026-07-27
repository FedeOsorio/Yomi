# Caso de Uso: Pre-procesamiento del Diccionario CC-CEDICT

## Descripción
Script offline que convierte el archivo de texto de CC-CEDICT en una base de datos SQLite optimizada para búsqueda fonética, y genera el archivo de constantes con las sílabas válidas de pinyin.

## Actores
- Desarrollador (proceso offline, no el usuario final)

## Precondiciones
- El archivo `assets/cedict/cedict_ts.u8` existe (descargado de MDBG).
- Las dependencias de desarrollo están instaladas (`sqlite3`, `tsx`).

## Flujo Principal
1. El desarrollador ejecuta `npm run build:dictionary`.
2. El script `scripts/build-dictionary.ts` lee el archivo `.u8` línea por línea.
3. Para cada entrada válida (regex: `^(\S+)\s(\S+)\s\[([^\]]+)\]\s\/(.+)\/$/`):
   - Extrae: tradicional, simplificado, pinyin numérico, significados.
   - Genera `pinyin_key` (normalizado sin tonos, para búsqueda).
   - Genera `pinyin_display` (con marcas diacríticas, para mostrar al usuario).
   - Recolecta sílabas base únicas.
   - Inserta en SQLite dentro de una transacción.
4. Al finalizar, genera `constants/pinyin-syllables.ts` con el Set de sílabas válidas (454 sílabas).

## Normalización del Pinyin
- `toSearchKey()`: quita tonos numéricos, convierte `ü`/`u:`/`v` → `v`, todo en minúsculas.
- `numericToDisplay()`: convierte tonos numéricos a marcas diacríticas (ej. `ni3 hao3` → `nǐ hǎo`).
- `extractToneNumber()`: separa la base de la sílaba del número de tono.

## Archivos Involucrados
- `scripts/build-dictionary.ts` — Script principal.
- `lib/pinyin-utils.ts` — Funciones de normalización reutilizadas por el script.
- `assets/cedict/cedict_ts.u8` — Archivo fuente (entrada).
- `assets/cedict/dictionary.db` — Base de datos SQLite (salida).
- `constants/pinyin-syllables.ts` — Set de sílabas válidas (salida).

## Resultado Esperado
- Se genera `dictionary.db` con ~124.733 entradas.
- Se genera `pinyin-syllables.ts` con 454 sílabas únicas.
- Ambos archivos se usan en runtime por la app.
