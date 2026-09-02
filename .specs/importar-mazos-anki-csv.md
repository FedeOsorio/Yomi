# Caso de Uso: Importación de Mazos desde Anki, CSV, TSV y Texto Plano

## Descripción
Permite al usuario importar lotes de tarjetas de vocabulario provenientes de exportaciones de Anki, archivos CSV/TSV o texto copiado de hojas de cálculo (Excel, Google Sheets), convirtiéndolos al formato nativo de Yomi con soporte completo de FSRS, lectura fonética y deduplicación automática.

## Actores
- Usuario de la aplicación.

## Precondiciones
- La base de datos local SQLite está inicializada.
- El usuario cuenta con el texto copiado de sus tarjetas en el portapapeles o exportado desde Anki.

## Flujo Principal
1. El usuario accede al importador desde:
   - El menú de opciones rápidas `(+)` en la pestaña de Colecciones (`/index.tsx`), o
   - El botón de importación dentro de la cabecera de un mazo específico (`/deck/[id].tsx`).
2. El usuario selecciona el mazo de destino:
   - **Crear Nuevo Mazo**: Ingresa el nombre y selecciona el idioma de estudio (Chino, Japonés, Inglés, etc.).
   - **Mazo Existente**: Elige uno de sus mazos actuales.
3. El usuario pega el contenido de sus tarjetas en el área de texto.
4. El usuario presiona **"Analizar y Previsualizar"**:
   - El parser (`lib/anki-importer.ts`) detecta el delimitador (tabulación TSV, coma, punto y coma, pipe).
   - Identifica y omite la fila de encabezados si está presente.
   - Limpia etiquetas HTML (`<div>`, `<br>`, `<b>`) y extrae furigana con sintaxis de Anki (`漢字[かんじ]`).
   - Muestra un resumen con las primeras 5 tarjetas detectadas (palabra, lectura, significado).
5. El usuario revisa la muestra y presiona **"Importar Tarjetas a Yomi"**.
6. El servicio `saveBatchWords` (`lib/word-service.ts`):
   - Realiza la deduplicación en memoria comparando `palabra + lectura` para no duplicar entradas existentes en ese mazo.
   - Inserta los registros en la tabla `words` de SQLite.
   - Genera los ítems correspondientes en `srsItems` inicializados con el algoritmo FSRS (estado `New`, fecha de repaso hoy).
7. La aplicación notifica la cantidad de palabras insertadas (y las repetidas omitidas) y redirige al usuario a la vista del mazo.

## Reglas de Negocio
1. **Desacoplamiento Estricto**: La lógica de parsing y normalización (`lib/anki-importer.ts`) es una función pura independiente de la UI.
2. **Compatibilidad con Anki**: Si una palabra contiene furigana entre corchetes (ej. `明日[あした]`), se extrae `明日` como término principal y `あした` como lectura fonética.
3. **Deduplicación**: No se insertan palabras idénticas que ya existan dentro del mismo mazo de destino.
4. **FSRS por Defecto**: Toda palabra importada queda automáticamente lista para su primer ciclo de estudio en el motor de repaso SRS.

## Archivos Involucrados
- `lib/anki-importer.ts` — Parser universal de CSV/TSV/Anki y analizador de columnas.
- `lib/word-service.ts` — Función `saveBatchWords` para inserción por lotes en SQLite.
- `src/app/deck/import.tsx` — Pantalla de importación, previsualización y confirmación.
- `src/app/(tabs)/index.tsx` — Acceso desde el menú principal `(+)`.
- `src/app/deck/[id].tsx` — Acceso directo desde el mazo seleccionado.
