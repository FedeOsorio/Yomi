# Caso de Uso — Pantalla de Perfil y Configuración

## Descripción
Ubicada en la barra de navegación inferior (`src/app/(tabs)/profile.tsx`), brinda un resumen del progreso de estudio del usuario y controles de configuración general.

## Funcionalidades Principales:
1. **Resumen de Métricas**:
   - Total de tarjetas guardadas en la base de datos.
   - Tarjetas pendientes de repaso para hoy.
   - Tarjetas en Nivel 1 (Nuevas).
2. **Conmutador de Apariencia**:
   - Interruptor (Switch) para cambiar instantáneamente entre Modo Oscuro y Modo Claro.
3. **Copia de Seguridad y Restauración (Google Drive / Nube)**:
   - Exportación completa del estado de la app en formato `.yomi` autocontenido (mazos, palabras, oraciones, estado FSRS de tarjetas).
   - Menú del sistema para guardar directamente en Google Drive, compartir por mensajería o almacenar en archivos locales.
   - Restauración con selección nativa de archivo (`expo-document-picker`) con opciones de fusión (Merge) o reemplazo íntegro.
   - Indicador con fecha y hora del último respaldo realizado.
4. **Prueba de Pronunciación TTS**:
   - Botones interactivos para probar la voz nativa instalada en el sistema para Japonés, Chino e Inglés.
5. **Información del Sistema**:
   - Resumen técnico sobre FSRS v5, arquitectura de dos bases de datos SQLite (`user_data.db` ligera y respaldable + `dictionary.db` estática) y clasificaciones oficiales JLPT/HSK.

