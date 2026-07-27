# Caso de Uso: Constructor de Palabras Manual (Word Builder)

## Descripción
Permite al usuario armar palabras personalizadas que no están presentes en el diccionario CC-CEDICT (ej. modismos o palabras informales como "Xie la") seleccionando caracteres sugeridos por sílaba y agregando un significado manual en español.

## Actores
- Usuario

## Precondiciones
- El usuario abrió la pantalla de búsqueda desde el botón `+` (FAB) de la pantalla principal.

## Flujo Principal
1. El usuario ingresa una búsqueda de pinyin (ej. `xiela`).
2. El sistema detecta que no existen coincidencias exactas completas en el diccionario.
3. El sistema segmenta el pinyin en sílabas (`xie`, `la`).
4. Para cada sílaba, busca en SQLite los caracteres individuales asociados a ese sonido y los renderiza en filas de selección horizontal.
5. El usuario toca el caracter deseado para cada sílaba (ej. `谢` para `xie`, `啦` para `la`).
6. El usuario escribe el significado en español en el campo de texto (ej. "Gracias (informal)").
7. El usuario presiona el botón "Guardar palabra".
8. El sistema invoca `lib/word-service.ts` → `saveCustomWord()` para guardar la palabra en el mazo por defecto y crear su tarjeta SRS correspondiente.
9. Se notifica al usuario y se cierra la modal.

## Archivos Involucrados
- `src/app/search.tsx` — Interfaz de búsqueda y Word Builder (UI).
- `lib/search-engine.ts` — Obtención de candidatos por sílaba.
- `lib/word-service.ts` — Función `saveCustomWord()`.
- `db/schema.ts` — Tablas `words` y `srs_items`.

## Resultado Esperado
- El usuario puede construir y guardar cualquier palabra o modismo en pocos toques, incluso si no existe en el diccionario.
