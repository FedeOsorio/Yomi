# Caso de Uso — Header Dinámico Yomi

## Descripción
Define el comportamiento del encabezado superior global que mantiene la identidad de marca `Yomi` e indica dinámicamente la sección o mazo actual.

## Formato del Header
`Yomi • [Nombre de la Sección o Mazo]`

## Pantallas y Títulos:
1. **Mis Colecciones / Inicio**: `Yomi • Mis Colecciones`
2. **Repaso SRS**: `Yomi • Repaso SRS`
3. **Perfil y Ajustes**: `Yomi • Perfil y Ajustes`
4. **Detalle de Mazo**: `Yomi • Mazo [Nombre]`
5. **Detalle de Palabra**: `Yomi • Detalle de Palabra`
6. **Búsqueda**: `Yomi • Buscar Palabra`

## Reglas de Implementación:
- El logotipo `Yomi` se renderiza con el color primario de la app y peso tipográfico de marca (fontWeight: '800').
- El separador `•` y el subtítulo se adaptan al color de texto según el tema visual activo (Modo Claro / Modo Oscuro).
