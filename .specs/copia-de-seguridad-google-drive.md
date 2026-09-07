# Caso de Uso — Copia de Seguridad y Restauración (Google Drive / Nube)

## 1. Contexto y Justificación Técnica
Originalmente, Yomi utilizaba un único archivo SQLite (`yomi.db`) que contenía tanto el diccionario CC-CEDICT (~19 MB) como los datos del usuario. Al desinstalar la app, el sistema operativo eliminaba el sandbox local, y el servicio nativo de Auto-Backup de Android descartaba la base de datos por superar el límite estricto de 25 MB.

Para garantizar la persistencia de datos y posibilitar la recuperación ante desinstalaciones o cambios de dispositivo:
1. Se separaron las bases de datos en:
   - `dictionary.db`: Base de solo lectura empaquetada en los assets de la app (CC-CEDICT).
   - `user_data.db`: Base viva del usuario donde Drizzle ORM administra exclusivamente las tablas `decks`, `words`, `sentences`, `sentence_words` y `srs_items` (< 100 KB).
2. Se implementó un motor de respaldo completo (`lib/backup-service.ts`) con integración nativa a Google Drive y selector de documentos.

---

## 2. Especificación del Paquete de Respaldo (`yomi-full-backup-v1`)
El archivo de respaldo tiene extensión `.yomi` y contiene una estructura JSON validada:
* `format`: `'yomi-full-backup-v1'`
* `version`: `1`
* `createdAt`: Timestamp ISO de generación.
* `metadata`:
  - `appVersion`: Versión de la app.
  - `decksCount`, `wordsCount`, `sentencesCount`, `srsCount`: Estadísticas de control de integridad.
* `data`:
  - `decks`: Arreglo de mazos con `id`, `name`, `languageCode`, `createdAt`.
  - `words`: Términos con `deckId`, `simplified`, `traditional`, `pinyinDisplay`, `pinyinNumeric`, `meanings`, `auxiliaryInfo`.
  - `sentences`: Oraciones de ejemplo con `deckId`, `textContent`, `readingContent`, `translation`.
  - `sentenceWords`: Relaciones muchos a muchos entre oraciones y palabras.
  - `srsItems`: Tarjetas de repaso FSRS con sus parámetros matemáticos exactos preservados (`state`, `due`, `stability`, `difficulty`, `elapsedDays`, `scheduledDays`, `reps`, `lapses`, `lastReview`).

---

## 3. Flujo de Exportación (Google Drive / Compartir)
1. El usuario pulsa **"Crear copia de seguridad"** en la pantalla de Perfil.
2. `exportFullBackup()` serializa las tablas desde `user_data.db`.
3. Se crea un archivo temporal `yomi-backup-YYYY-MM-DD.yomi` en caché.
4. Se invoca `Share.share(...)`, permitiendo al usuario:
   - Seleccionar **"Guardar en Google Drive"** para sincronizarlo a su cuenta en la nube.
   - Enviar por correo, mensajería o guardar en el almacenamiento local.
5. Se actualiza el timestamp en `storage-service` y se muestra la fecha del último respaldo en la interfaz.

---

## 4. Flujo de Restauración
1. El usuario pulsa **"Restaurar desde archivo / Drive"**.
2. Se invoca `DocumentPicker.getDocumentAsync()` para seleccionar el archivo `.yomi` desde Google Drive o almacenamiento interno.
3. Se valida la estructura con `parseBackupFile()`.
4. Se muestra un diálogo confirmatorio indicando la fecha de la copia y cantidad de mazos, palabras y tarjetas.
5. El usuario elige la estrategia:
   - **Combinar (Merge)**: Inserta mazos y palabras que no existan previamente sin borrar los datos actuales.
   - **Reemplazar Todo (Replace)**: Vacía las tablas locales e inserta exactamente el contenido del respaldo, restaurando el estado del repaso FSRS.
6. Se actualizan las estadísticas de estudio y se muestra una notificación de éxito.
