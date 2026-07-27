# Caso de Uso: Guardar Palabra Rápida

## Descripción
El usuario guarda una palabra del diccionario en su mazo personal con un solo toque, sin necesidad de configurar nada manualmente. Se genera automáticamente la tarjeta SRS asociada.

## Actores
- Usuario

## Precondiciones
- El usuario realizó una búsqueda por pinyin y tiene resultados visibles.
- Existe al menos un mazo (se crea automáticamente "Mi Vocabulario" si no hay ninguno).

## Flujo Principal
1. El usuario toca el botón "+" en una tarjeta de resultado.
2. El sistema llama a `lib/deck-service.ts` → `getDefaultDeckId()`:
   - Si no existe ningún mazo, crea uno llamado "Mi Vocabulario" con `languageCode: 'zh-CN'`.
   - Si ya existe, devuelve el ID del primer mazo.
3. El sistema llama a `lib/word-service.ts` → `saveWords()`:
   - **Verifica duplicados**: consulta si ya existe una fila en `words` con el mismo `deckId` + `simplified` + `pinyinNumeric`.
   - Si ya existe, **no la guarda** (skip silencioso).
   - Si no existe, inserta una fila nueva en `words` con un UUID generado por `expo-crypto`.
4. El sistema crea automáticamente una fila en `srs_items` usando `lib/srs-engine.ts` → `createNewSrsItem()`, con los campos desnormalizados (`displayText`, `displayReading`, `displayMeaning`) y el estado inicial de `ts-fsrs`.

## Archivos Involucrados
- `src/app/(tabs)/index.tsx` — Botón "+" y llamada a `handleQuickSave()`.
- `lib/word-service.ts` — Función `saveWords()` con verificación de duplicados.
- `lib/deck-service.ts` — Función `getDefaultDeckId()`.
- `lib/srs-engine.ts` — Función `createNewSrsItem()`.
- `db/schema.ts` — Tablas `words`, `srs_items`, `decks`.

## Reglas de Negocio
- **No se permiten duplicados**: misma palabra (simplified + pinyinNumeric) en el mismo mazo se ignora silenciosamente.
- **UUID único por tarjeta**: cada `word` y `srs_item` tiene un UUID v4 independiente, generado localmente. Esto permite sincronización futura sin colisiones entre usuarios.
- **Desnormalización intencional**: `srs_items` copia `displayText`, `displayReading` y `displayMeaning` desde la entrada del diccionario para evitar JOINs costosos durante el repaso.

## Resultado Esperado
- La palabra se guarda en el mazo del usuario.
- Se crea una tarjeta SRS lista para ser repasada.
- Si la palabra ya estaba guardada, no se duplica.
