# Caso de Uso: Gestión de Mazos Multidioma y Eliminación de Mazos

## Descripción
Permite al usuario crear, organizar y eliminar sus mazos según el idioma de estudio, con reconocimiento automático a partir de lo que el usuario sabe (Pinyin en Chino, Romaji/Kana en Japonés, o palabras directas en otros idiomas) sin necesidad de rellenar formularios complejos. Al eliminar un mazo, se realiza un borrado en cascada seguro de todas sus palabras asociadas y de sus registros de repaso FSRS.

## Actores
- Usuario que aprende uno o más idiomas (Chino, Japonés, Inglés, Español, etc.).

## Precondiciones
- La base de datos SQLite y las funciones de base de datos están disponibles.

## Flujo Principal
1. **Creación de Mazos**:
   - El usuario abre el modal (+), ingresa un nombre y selecciona un idioma soportado (ej. Chino, Japonés, Inglés).
2. **Reconocimiento Fonético y Búsqueda Multidioma**:
   - En Chino (`zh-CN`): Reconocimiento por Pinyin y constructor de sílabas.
   - En Japonés (`ja-JP`): Conversión Romaji $\rightarrow$ Hiragana y consulta en JMdict en español.
3. **Eliminación de Mazos (Delete Deck)**:
   - **Desde el Detalle del Mazo (`src/app/deck/[id].tsx`)**: El usuario pulsa el icono de papelera en la barra superior. Se solicita confirmación por diálogo de alerta. Al confirmar, llama a `deleteDeck(id)`, eliminando el mazo, sus palabras y sus registros FSRS asociados, y regresa a "Mis Colecciones".
   - **Desde la Lista de Colecciones (`src/app/(tabs)/index.tsx`)**: El usuario pulsa el icono de papelera o realiza una pulsación larga sobre la tarjeta del mazo para solicitar la confirmación de borrado.

## Archivos Involucrados
- `lib/deck-service.ts` — `createDeck`, `deleteDeck`, `getDecksWithStats`.
- `src/app/deck/[id].tsx` — Detalle del mazo con acción de borrado en el header.
- `src/app/(tabs)/index.tsx` — Lista de colecciones con borrado rápido.
- `src/app/search.tsx` — Pantalla de reconocimiento automático y búsqueda.
