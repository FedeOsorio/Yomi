# Plan Maestro: Actualización a Expo SDK 58, Optimización R8 y Lavado de Cara con @expo/ui

Este documento está diseñado para el próximo agente/chat que encare un nuevo proyecto o el rediseño integral de la aplicación. Contiene la fórmula exacta, probada y validada para:
1. **Actualizar limpiamente a Expo SDK 58, React Native 0.88 y React 19.3.**
2. **Obtener los 4 tildes verdes de optimización R8 en Google Play Console** (sin advertencias de AGP ni de recursos).
3. **Ejecutar un lavado de cara completo ("menos es más") aprovechando `@expo/ui`** con Jetpack Compose (Android) y SwiftUI (iOS).

---

## 1. Migración Eficaz a Expo SDK 58 y React Native 0.88

### 1.1. Actualización de paquetes base
Para sincronizar las versiones oficiales del SDK 58:
```bash
npx expo install expo@latest --fix
```

### 1.2. El problema clásico de npm (`ERESOLVE could not resolve dependency`)
Al saltar de SDK 57 a 58 o al instalar módulos de Expo en React 19, npm a menudo bloquea la instalación por dependencias de pares (`conflicting peer dependency`).

> [!CAUTION]
> **No borres `node_modules` a ciegas sin configurar npm.** Borrar `node_modules` no soluciona el conflicto de resolución de npm.

**La solución definitiva:**
1. Crear un archivo `.npmrc` en la raíz del proyecto:
   ```ini
   legacy-peer-deps=true
   ```
2. Ejecutar la instalación con el flag correspondiente:
   ```bash
   npm install --legacy-peer-deps
   ```

### 1.3. Sincronización estricta de `package-lock.json` para EAS Build
EAS Build en la nube ejecuta `npm ci --include=dev`. Si el `package-lock.json` no está 100% sincronizado con `package.json`, la nube aborta con:
`npm error code EUSAGE: Missing: @react-native/metro-config@... from lock file`

**Pasos obligatorios antes de enviar a EAS Build:**
1. Sincronizar el lockfile localmente:
   ```bash
   npm install --package-lock-only
   ```
2. Validar que una instalación limpia pasará sin errores en la nube:
   ```bash
   npm ci --dry-run
   ```
   *(Debe retornar código de salida 0).*
3. Guardar y registrar en el control de versiones:
   - `package.json`
   - `package-lock.json`
   - `.npmrc`

### 1.4. Ajustes de código y TypeScript para React 19.3 y React Native 0.88
React 19 y RN 0.88 introducen cambios estrictos en el tipado:

1. **`expo-file-system` (lectura binaria y buffers):**
   - En SDK 58, `handle.readBytes(length)` devuelve una `Promise<Uint8Array>`.
   - Para lectores síncronos (por ejemplo descompresores ZIP, parsers binarios o SQLite), usar la nueva API síncrona:
     ```typescript
     const chunk = handle.readBytesSync(length);
     ```

2. **Tipado de referencias (`useRef`) en React Native 0.88:**
   - En React 19, `ScrollView`, `TextInput` y `View` son componentes funcionales.
   - Usar `useRef<ScrollView>(null)` causa un error de tipos TS. Usar el tipo de instancia:
     ```typescript
     import { ScrollView, ScrollViewInstance, TextInput, TextInputInstance } from 'react-native';

     const scrollRef = useRef<ScrollViewInstance>(null); // o useRef<any>(null)
     const inputRef = useRef<TextInputInstance>(null);
     ```

3. **Valores `null` en props de componentes y navegación:**
   - En React 19 y Expo Router, pasar `null` a props como `color` o componentes de lista vacíos produce advertencias/errores.
   - En iconos de navegación: `color={typeof color === 'string' ? color : undefined}`.
   - En listas (`ListHeaderComponent`, `ListEmptyComponent`): usar `undefined` en vez de `null`.

4. **Validación:**
   - `npx tsc --noEmit` (debe dar **0 errores**).
   - `npx expo-doctor` (debe dar **20/20 checks pasados**).

---

## 2. Configuración de R8 para los 4 Tildes Verdes en Google Play Console

En Google Play Console (*Explorador de paquetes de aplicaciones > Versión > Configuración de R8*), se auditan 4 optimizaciones. A continuación se detalla cómo garantizar que las 4 estén activadas:

```
✔ Modo completo
✔ Reducción de recursos
✔ Reducción de recursos optimizada
✔ Clases de reempaquetado
```

### 2.1. Modo Completo (*Full Mode*)
* Viene activado por defecto con Android Gradle Plugin 9.0 (AGP 9) en Expo SDK 58.
* Verificar que **no** exista `android.enableR8.fullMode=false` en `gradle.properties`.

### 2.2. Reducción de Recursos (*Resource Shrinking*)
En `app.json`, dentro de `plugins` > `expo-build-properties`:
```json
[
  "expo-build-properties",
  {
    "android": {
      "enableMinifyInReleaseBuilds": true,
      "enableShrinkResourcesInReleaseBuilds": true
    }
  }
]
```

### 2.3. Reducción de Recursos Optimizada (*Optimized Resource Shrinking*)
Esta bandera permite que R8 unifique la eliminación de código y recursos en una sola pasada.

> [!IMPORTANT]
> **Por qué no alcanza con agregarlo a `android/gradle.properties`:**
> En proyectos administrados por Expo, la carpeta `android/` está ignorada en `.gitignore`. Durante la compilación en EAS Build, la carpeta nativa se regenera desde cero con `expo prebuild`. Además, `expo-build-properties` no admite claves arbitrarias en su esquema.
>
> **La solución correcta mediante Config Plugin:**
> En el plugin de configuración de Android (por ejemplo `plugins/withAndroidSigning.js` o un plugin dedicado):
> ```javascript
> const { withGradleProperties } = require('@expo/config-plugins');
>
> function withOptimizedR8(config) {
>   return withGradleProperties(config, (configMod) => {
>     const exists = configMod.modResults.some(
>       (item) => item.key === 'android.r8.optimizedResourceShrinking'
>     );
>     if (!exists) {
>       configMod.modResults.push({
>         type: 'property',
>         key: 'android.r8.optimizedResourceShrinking',
>         value: 'true',
>       });
>     }
>     return configMod;
>   });
> }
> ```
> Asegurarse de referenciar el plugin en `app.json`.

### 2.4. Clases de Reempaquetado (*Repackaged Classes*)
Esta regla aplana los nombres de paquetes ofuscados en un único paquete raíz, reduciendo el tamaño de la tabla DEX y optimizando el inicio de la app.
Se configura agregando `-repackageclasses ''` a las reglas de ProGuard:

1. En `app.json` bajo `expo-build-properties`:
   ```json
   {
     "android": {
       "extraProguardRules": "-repackageclasses ''"
     }
   }
   ```
2. Y si existe `android/app/proguard-rules.pro`, añadir al final:
   ```pro
   -repackageclasses ''
   ```

---

## 3. Guía para el Lavado de Cara Completo con `@expo/ui`

`@expo/ui` en Expo SDK 58 permite renderizar componentes declarativos respaldados directamente por **Jetpack Compose en Android** y **SwiftUI en iOS**. Esto elimina la sobrecarga de vistas compuestas de React Native tradicional, ofreciendo animaciones nativas a 120 FPS y una estética limpia del sistema operativo.

### 3.1. Primitivas Nativas de `@expo/ui` (Universal API)

Todos los componentes de `@expo/ui` deben ejecutarse dentro de un contenedor `<Host>`:

```tsx
import { 
  Host, 
  Column, 
  Row, 
  Text, 
  Button, 
  List, 
  ListItem, 
  FieldGroup,
  BottomSheet,
  Spacer 
} from '@expo/ui';
```

#### A. Contenedores de Layout (`Column`, `Row`, `Spacer`)
Reemplazan vistas pesadas con flexbox manual por stacks nativos con espaciado consistente:
```tsx
<Host style={{ flex: 1 }}>
  <Column spacing={16} style={{ padding: 20 }}>
    <Text textStyle={{ fontSize: 24, fontWeight: '700', color: '#111827' }}>
      Resumen del Día
    </Text>
    
    <Row spacing={12} alignment="center">
      <Button 
        variant="filled" 
        label="Comenzar práctica" 
        onPress={handleStart} 
      />
      <Button 
        variant="text" 
        label="Configurar" 
        onPress={handleSettings} 
      />
    </Row>
  </Column>
</Host>
```

#### B. Listas Fluidas y Recicladas (`List` y `ListItem`)
* En Android utiliza **Jetpack Compose `LazyColumn`**.
* En iOS utiliza **SwiftUI `List`**.
* Incluye soporte nativo para pull-to-refresh (`onRefresh`) y slots (`leading`, `trailing`, `supportingText`):
```tsx
<Host style={{ flex: 1 }}>
  <List onRefresh={async () => await refreshData()}>
    {items.map((item) => (
      <ListItem
        key={item.id}
        onPress={() => navigateToDetail(item.id)}
        supportingText={item.subtitle}
        trailing={
          <Text textStyle={{ fontSize: 13, color: '#6B7280' }}>
            {item.badgeText}
          </Text>
        }
      >
        <Text textStyle={{ fontSize: 16, fontWeight: '600' }}>
          {item.title}
        </Text>
      </ListItem>
    ))}
  </List>
</Host>
```

#### C. Pantallas de Ajustes y Formularios Nativos (`FieldGroup`)
Emula el estilo de ajustes nativo (SwiftUI `Form` / Material 3 Settings Group):
```tsx
<Host style={{ flex: 1 }}>
  <FieldGroup>
    <FieldGroup.Section title="Preferencias de Estudio">
      <ListItem supportingText="Activar repaso automático">
        Recordatorios
      </ListItem>
      <ListItem supportingText="Estilo de tarjetas">
        Modo Oscuro
      </ListItem>
    </FieldGroup.Section>
  </FieldGroup>
</Host>
```

---

## 4. Filosofía de Rediseño: "Menos es Más"

Para que la aplicación se sienta moderna, ágil y limpia, el rediseño debe respetar estrictamente estos principios:

1. **Cero iconos decorativos o redundantes:**
   - Si un botón tiene una etiqueta textual clara (ej. `"Guardar"`, `"Traducir"`, `"Continuar"`), **no agregar iconos al lado**. El texto debe ser el protagonista.
   - Dejar los iconos exclusivamente para botones de acción flotantes o acciones universales sin texto (ej. lupa de búsqueda en la barra superior o botón de cerrar modal).

2. **Cero aclaraciones entre paréntesis `( )`:**
   - Evitar textos como `"Pregunta (Frente)"`, `"Todo el mazo (50 palabras)"`, `"Traducir (español)"`.
   - El contexto debe quedar claro por la posición visual, la jerarquía tipográfica o un texto de soporte sobrio.

3. **Tipografía y jerarquía en lugar de cajas pesadas:**
   - No encapsular cada fragmento de información en una tarjeta con borde gris o fondo llamativo.
   - Utilizar contrastes de pesos tipográficos (`bold`, `600`, `normal`), tamaños y espacios en blanco generosos.

4. **Fluidez de scroll (60–120 FPS):**
   - Cuando se utilice texto auto-ajustable (`adjustsFontSizeToFit`), **siempre establecer `minimumFontScale={0.75}`**. Esto evita cálculos iterativos infinitos en Android durante el desplazamiento.
   - Evitar aplicar `itemLayoutAnimation` sobre elementos de listas virtuales durante el scroll vertical continuo, ya que fuerza mediciones en cada fotograma.

---

## 5. Reglas de Validación Técnica

Tras cualquier cambio en código, antes de dar por cerrada una tarea:
1. `npx tsc --noEmit` debe dar 0 errores.
2. Si el proyecto tiene tests de lógica o práctica (ej. `npm run test:conjugation` y `npm run test:practice`), ambos deben pasar con éxito ("Todo bien").
3. Recordar que el control de versiones (Git) lo gestiona el usuario directamente; no ejecutar comandos de Git automáticos.
