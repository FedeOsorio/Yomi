# Especificación Técnica: Optimización de Animaciones UI a 60 FPS

## Objetivo
Establecer las reglas, curvas y buenas prácticas arquitectónicas para que todas las animaciones (modales, hojas inferiores/bottom sheets, flips 3D, transiciones) corran a 60/120 FPS estables sin caídas de fotogramas (*frame drops* o *stutter*) en iOS y Android.

---

## 1. Reglas Fundamentales de Rendimiento

1. **Uso Obligatorio de `useNativeDriver: true`**:
   - Solo se deben animar propiedades soportadas por el driver nativo: `transform` (`translateY`, `translateX`, `scale`, `rotate`, `rotateY`) y `opacity`.
   - **NUNCA** animar `height`, `width`, `top`, `bottom`, `padding` o `margin` mediante `Animated.Value`.

2. **Evitar `renderToHardwareTextureAndroid={true}` en Contenedores Complejos**:
   - `renderToHardwareTextureAndroid` obliga al motor OpenGL de Android a rasterizar y transferir un mapa de bits completo en la memoria GPU.
   - En vistas con `TextInput`, `ScrollView` o texto dinámico, esto produce caídas críticas de FPS en cada cuadro. Solo se usa en vistas estáticas muy puntuales o se omite por completo.

3. **Manejo del Teclado y `KeyboardAvoidingView`**:
   - En Android, `Modal` ya administra el redimensionamiento del teclado mediante `windowSoftInputMode="adjustResize"`.
   - Usar `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`. Nunca usar `behavior="height"` en Android dentro de modales animados porque dispara recálculos síncronos de layout durante la transición.

4. **Curvas de Aceleración y Desaceleración (Easing y Spring)**:
   - **Simetría Entrada / Salida**:
     - Usar la misma física de resorte (`Animated.spring`) con `toValue: 0` al cerrar que al abrir (`damping: 26`, `mass: 0.7`, `stiffness: 260`, `overshootClamping: true`).
     - Al usar resortes nativos simétricos, la velocidad percibida y la inercia son idénticas en apertura y cierre, eliminando la sensación de salto o retraso.

5. **Desenfoque de Inputs (`inputRef.current?.blur()`)**:
   - En Android, un `TextInput` enfocado mantiene activa la rutina nativa de parpadeo del cursor (`updateCursorPosition` y `Editor.java`).
   - Mover un `TextInput` enfocado con `translateY` fuerza al hilo nativo a recalcular las coordenadas del cursor en cada cuadro. Desenfocar explícitamente los inputs antes de iniciar la animación desactiva este listener y evita caídas de FPS.

6. **Aislamiento de Cierre (`isClosingRef`)**:
   - Evitar disparos duplicados o interrupciones de animación al tocar múltiples veces el botón cerrar o el backdrop mediante un ref bandera:
     ```ts
     const isClosingRef = useRef(false);
     if (isClosingRef.current) return;
     isClosingRef.current = true;
     ```

7. **Desplazamiento Dinámico desde Pantalla**:
   - En lugar de valores fijos (ej. `450`), calibrar `sheetTranslateY` con `Dimensions.get('window').height` para asegurar que el componente comience y termine completamente fuera del viewport.

8. **Sombras y Elevación (`elevation: 0`)**:
   - En hojas inferiores animadas con esquinas redondeadas asimétricas (`borderTopLeftRadius`), Android no puede usar atajos de sombreado por hardware y recalcula la máscara de sombra en cada frame.
   - Forzar `elevation: 0` en el contenedor animado (la profundidad ya la aporta el fondo oscuro semitransparente).

---

## 2. Patrón Estándar para Modales Bottom Sheet

```tsx
// 1. Estado y valores animados
const animProgress = useRef(new Animated.Value(0)).current;
const isClosingRef = useRef(false);
const questionInputRef = useRef<TextInput>(null);
const answerInputRef = useRef<TextInput>(null);
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const backdropOpacity = animProgress.interpolate({
  inputRange: [0, 1],
  outputRange: [0, 1],
});

const sheetTranslateY = animProgress.interpolate({
  inputRange: [0, 1],
  outputRange: [SCREEN_HEIGHT, 0],
});

// 2. Apertura (Mount / Visible)
useEffect(() => {
  if (visible) {
    isClosingRef.current = false;
    animProgress.setValue(0);
    Animated.spring(animProgress, {
      toValue: 1,
      damping: 26,
      mass: 0.7,
      stiffness: 260,
      overshootClamping: true,
      useNativeDriver: true,
    }).start();
  }
}, [visible]);

// 3. Cierre Fluido (Misma física y velocidad que la apertura)
const handleClose = () => {
  if (isClosingRef.current) return;
  isClosingRef.current = true;
  questionInputRef.current?.blur();
  answerInputRef.current?.blur();
  Keyboard.dismiss();

  Animated.spring(animProgress, {
    toValue: 0,
    damping: 26,
    mass: 0.7,
    stiffness: 260,
    overshootClamping: true,
    useNativeDriver: true,
  }).start(() => {
    isClosingRef.current = false;
    onClose();
  });
};
```
