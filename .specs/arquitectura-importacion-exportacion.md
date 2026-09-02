# Guía de Arquitectura: Importación, Exportación y Formatos de Datos en Yomi

Este documento detalla el funcionamiento técnico, arquitectura y configuración del sistema de importación y transformación de datos desde fuentes externas (Anki, CSV, TSV, texto plano) hacia el modelo relacional y algoritmo FSRS de Yomi.

---

## 1. Arquitectura de Importación Desacoplada

El pipeline de importación fue diseñado bajo el principio de **responsabilidad única** para que no dependa de la interfaz gráfica ni de frameworks de presentación:

```
[ Archivo CSV / TSV / Notas de Anki ]
                   │
                   ▼
┌──────────────────────────────────────┐
│        lib/anki-importer.ts          │
│  - Detección automática delimitador  │
│  - Limpieza de tags HTML             │
│  - Extracción de Furigana Anki       │
│  - Mapeo inteligente de columnas     │
└──────────────────┬───────────────────┘
                   │
                   ▼ (ParsedVocabularyItem[])
┌──────────────────────────────────────┐
│         lib/word-service.ts          │
│           saveBatchWords()           │
│  - Deduplicación en memoria          │
│  - Inserción masiva en SQLite        │
│  - Creación de tarjetas FSRS         │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│           SQLite (Drizzle)           │
│  - words                             │
│  - srs_items (Estado: New, Due: Hoy) │
└──────────────────────────────────────┘
```

---

## 2. Formatos Soportados

### A. Archivos CSV / TSV de Anki
* **Delimitadores**:
  - Tabulación `\t` (formato nativo de exportación de Anki).
  - Comas `,` (CSV estándar).
  - Punto y coma `;` o pipes `|`.
* **Sintaxis Furigana de Anki**:
  - Si una nota incluye furigana en la misma columna con corchetes tipo `明日[あした]`, el parser extrae automáticamente `明日` como término y `あした` como lectura fonética.
* **Limpieza de HTML**:
  - Remueve etiquetas generadas por Anki como `<div>`, `<br>`, `<b>`, `<span>`, y entidades como `&nbsp;`.

### B. Formato Nativo Yomi (`yomi-deck-v1`)
Yomi cuenta con su propio formato de intercambio estructurado y autocontenido (`.yomi` / JSON estructurado):
* **Estructura**:
  - `format`: `'yomi-deck-v1'`
  - `deck`: Metadatos del mazo (`name`, `languageCode`).
  - `cards`: Listado completo de tarjetas con término (`text`), lectura fonética (`reading`), array de significados (`meanings`), nivel (`level`) y selección de significados activos (`selectedMeanings`).
* **Ventajas**:
  - Garantiza fidelidad 100% al compartir o respaldar mazos entre dispositivos Yomi sin pérdida de lecturas ni desconfiguración de delimitadores.
  - El importador reconoce automáticamente este formato y omite la necesidad de mapeo manual de columnas.

### C. Mapeo Automático de Columnas
El parser identifica las columnas por nombres de cabecera estándar (en inglés, español o pinyin) o por posición por defecto:
- **Término/Palabra**: `kanji`, `hanzi`, `word`, `front`, `término`, `palabra`.
- **Lectura/Pronunciación**: `furigana`, `reading`, `lectura`, `pinyin`, `kana`.
- **Significado**: `meaning`, `translation`, `significado`, `back`, `definition`.
- **Nivel/Etiqueta**: `level`, `jlpt`, `hsk`, `section`.

---

## 3. Flujo en la Interfaz (`src/app/deck/import.tsx`)

1. **Selección del Mazo**:
   - **Crear Nuevo Mazo**: El usuario asigna nombre e idioma (`zh-CN`, `ja-JP`, etc.).
   - **Mazo Existente**: Elige un mazo ya creado para incorporar el nuevo vocabulario.
2. **Entrada de Datos**:
   - Soporta pegar texto directo desde el portapapeles (incluso tablas completas de 1.800+ filas copiadas desde Excel o Google Sheets) o carga de archivos.
3. **Previsualización en Tiempo Real**:
   - Presenta el delimitador detectado, presencia de cabeceras y las primeras 5 tarjetas transformadas con término, lectura y significados.
4. **Ejecución y Notificación**:
   - Inserta las tarjetas evitando duplicados existentes y redirige a la vista del mazo.

---

## 4. Especificaciones Complementarias
- Para reglas de procesamiento de Chino Mandarín: [.specs/especificacion-chino-mandarin.md](file:///e:/Yomi/.specs/especificacion-chino-mandarin.md)
- Para reglas de procesamiento de Japonés: [.specs/especificacion-japones.md](file:///e:/Yomi/.specs/especificacion-japones.md)
- Para caso de uso detallado del importador: [.specs/importar-mazos-anki-csv.md](file:///e:/Yomi/.specs/importar-mazos-anki-csv.md)
