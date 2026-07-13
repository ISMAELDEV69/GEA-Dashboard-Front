# Cambiar Llave Principal de Grupos a ID Interno

Actualmente el sistema usa el `codigo` del grupo (ej. `GPE-2026001`) como identificador único. Esto causa problemas porque el archivo Excel real tiene:
1. Códigos que se repiten para diferentes campañas.
2. Filas que no tienen código (y se repiten para la misma campaña).

Para permitir que el sistema sea un reflejo 100% exacto del Excel sin generar sufijos (`_1`) ni códigos artificiales (`S/C-FILA`), debemos cambiar la arquitectura para que dependa de un ID interno (`uuid`) en lugar del código de texto.

## Cambios Propuestos

### Base de Datos
- Modificar la tabla `grupos_capacitacion` para agregar una columna `id uuid DEFAULT gen_random_uuid() PRIMARY KEY`.
- Quitar la restricción de Primary Key actual sobre `codigo`.
- Actualizar las tablas que dependen de este código (`nominas`, `asistencias_capacitacion`, etc.) para que referencien al nuevo `id` en lugar de `grupo_codigo`.

### Frontend
- Actualizar el selector de grupos en los formularios (`NominaForm.jsx`, `AsistenciaForm.jsx`) para que envíen el `id` en lugar del código, pero sigan mostrando "Campaña - Código" visualmente al usuario.
- Actualizar la lógica de carga masiva (`dataService.js`) para que haga el upsert sin basarse en el `codigo`, sino que limpie e inserte, o use un hash de la fila como ID.

> [!WARNING]
> Esto es un cambio estructural profundo. Requiere recrear las relaciones en la base de datos.

