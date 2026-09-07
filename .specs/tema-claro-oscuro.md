# Caso de Uso — Sistema de Tema Claro / Oscuro (Light & Dark Mode)

## Descripción
Permite alternar globalmente el esquema de colores de la interfaz entre el Modo Oscuro (Deep Space Dark) y el Modo Claro (Clean Slate Light).

## Arquitectura de Colores:
- **Dark Theme (`DarkColors`)**:
  - `background`: `#0B0D17`
  - `surface`: `#1A1D2D`
  - `surfaceHighlight`: `#2A2E43`
  - `text`: `#F3F4F6`
- **Light Theme (`LightColors`)**:
  - `background`: `#F8FAFC`
  - `surface`: `#FFFFFF`
  - `surfaceHighlight`: `#F1F5F9`
  - `text`: `#0F172A`

## Componente Proveedor:
`providers/ThemeProvider.tsx` provee el hook `useTheme()` con acceso a:
- `isDark`: boolean indicando si está activo el Modo Oscuro.
- `colors`: objeto con las variables de color del tema activo.
- `toggleTheme()`: función para conmutar entre claro y oscuro.

## Reglas de Integración:
- **Detección Automática Inicial**: En la primera instalación (o si no existe clave `'yomi_theme_mode'` en almacenamiento persistente), la aplicación detecta y respeta automáticamente el esquema de color activo en el sistema operativo del usuario (`useColorScheme()`).
- Si el usuario conmuta el tema manualmente mediante `toggleTheme()`, la preferencia seleccionada se almacena localmente y prevalece en los siguientes arranques.
- Todos los componentes y pantallas consumen `useTheme()` para definir estilos dinámicos.
- `providers/ThemeProvider.tsx` integra `<StatusBar style={isDark ? 'light' : 'dark'} backgroundColor="transparent" translucent />` garantizando que la barra de estado y notificaciones del dispositivo sea siempre legible (iconos blancos sobre fondo oscuro y oscuros sobre fondo claro).
- Los badges de nivel (`JLPT N5`, `HSK 1`), botones principales y resaltados preservan la identidad de marca independientemente del modo visual.
