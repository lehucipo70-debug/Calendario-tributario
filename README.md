# Calendario tributario · Planner del equipo

Planner de tareas del equipo contable: tablero, lista, calendario y rendimiento por colaborador. Es una sola página (`index.html`) publicada con GitHub Pages y conectada a Supabase.

## Roles

- **Administrador** (`admin`, `lider`, `supervisor`): ve todas las tareas, importa Excel y ve el rendimiento del equipo.
- **Colaborador** (cualquier otro rol, por ejemplo `contador`): ve y edita solo sus tareas.

Los colaboradores se crean en Supabase: primero el usuario en **Authentication → Users** y luego su fila en la tabla `perfiles`, con el mismo `id`.

## Importar tareas desde Excel

En **Administración → Seleccionar archivo Excel**. La primera fila debe tener estos encabezados:

| Columna | Obligatoria | Ejemplo |
| --- | --- | --- |
| TAREA | Sí | Declaración de IVA bimestral |
| RESPONSABLE | No | Valentina |
| FECHA LIMITE | No | 26/10/2026 |
| EMPRESA | No | Comercial Andina SAS |
| CATEGORIA | No | Tributario |
| PRIORIDAD | No | Urgente, Alta, Media o Baja |
| ESTADO | No | Pendiente, En progreso, En revisión o Completada |
| DESCRIPCION | No | NIT 900123456 |

- **RESPONSABLE** se asocia con el nombre del perfil (basta el primer nombre). Crea el perfil **antes** de importar; si no existe, la tarea queda sin asignar.
- Importar el mismo archivo otra vez no duplica tareas.

## Avisos de escritorio

La campana de la barra superior activa los avisos del navegador (cada persona los activa en su equipo; el navegador pide permiso la primera vez):

- **Vencimientos**: al entrar y cada 30 minutos avisa de tus tareas vencidas, que vencen hoy o en los próximos días (`DIAS_ALERTA`). Cada tarea avisa una vez al día.
- **Asignaciones**: cuando otra persona te asigna una tarea, llega el aviso al momento.
- **Actividad del equipo** (administradores, y quien creó la tarea): cuando un colaborador completa una tarea, le cambia el estado o crea una nueva, llega el aviso al momento. Los cambios propios no avisan.
- Al hacer clic en el aviso se abre la tarea.

Los avisos llegan mientras la página esté abierta, aunque esté en otra pestaña o minimizada. Si se bloquearon, se vuelven a permitir desde el candado junto a la dirección de la página.

## Notas personales

La sección **Notas** es un bloc de notas privado: cada persona ve solo las suyas (carpetas Todas, Favoritas, Recientes, Archivadas y Papelera; fijar, favorita, color, buscador y guardado automático).

Para activarla, ejecuta una sola vez [`supabase/notas.sql`](supabase/notas.sql) en Supabase → **SQL Editor**. Mientras no exista la tabla, la sección muestra un aviso.

## Modo demo

Abre la página con `?demo` al final de la dirección para probarla con datos de ejemplo guardados solo en el navegador.
