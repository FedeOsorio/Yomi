# Caso de Uso — Actualizaciones OTA Automáticas (EAS Update)

## 1. Descripción y Objetivo
Permite que Yomi aplique correcciones críticas de errores, nuevas funciones y mejoras de rendimiento sin requerir que los usuarios descarguen una nueva APK/AAB desde Google Play Store.

Inspirado en la arquitectura de `E:/kana-love`, el sistema verifica al inicio de la aplicación si existe un nuevo bundle de JavaScript publicado en el canal correspondiente de EAS Update, descargándolo en segundo plano y reiniciando automáticamente la app con un overlay estético para una experiencia de usuario fluida.

---

## 2. Componente y Montaje
* **Componente**: `src/components/OTAUpdateOverlay.tsx`
* **Montaje**: En la raíz de la aplicación ([src/app/_layout.tsx](file:///e:/Yomi/src/app/_layout.tsx)), asegurando cobertura total de la pantalla por encima del `Stack` de navegación.

---

## 3. Flujo de Ejecución:
1. **Filtro de Entorno**:
   - Se omite automáticamente en plataforma Web (`Platform.OS === 'web'`) o en modo desarrollo local (`__DEV__`).
2. **Ventana de Arranque (12 segundos)**:
   - Para no interrumpir al usuario a mitad de una sesión de estudio de vocabulario o repaso SRS, la actualización automática forzada solo se ejecuta si se detecta durante los primeros 12 segundos tras abrir la aplicación (`isStartupRef`).
3. **Doble Mecanismo de Detección**:
   - **Chequeo Directo**: `Updates.checkForUpdateAsync()` consulta el servidor inmediatamente al arrancar.
   - **Escucha Reactiva**: El hook `Updates.useUpdates()` escucha eventos del runtime de EAS Update.
4. **Pantalla de Superposición (Overlay)**:
   - Si `isUpdateAvailable` es verdadero, emerge un fondo deep space (`#0B0D17`) con opacidad animada mediante `react-native-reanimated`.
   - Icono `sparkles` con pulso sutil y `ActivityIndicator` primario.
   - Mensajes: *"Actualizando Yomi..."* y *"Descargando la última versión. La aplicación se reiniciará automáticamente."*
5. **Descarga y Reinicio Transparente**:
   - Se invoca `Updates.fetchUpdateAsync()`.
   - Al finalizar (`isUpdatePending`), se garantiza una transición mínima para evitar parpadeos y se invoca `Updates.reloadAsync()`.
   - La aplicación se reinicia al instante cargando el nuevo bundle en memoria.
