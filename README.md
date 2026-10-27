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
- Al hacer clic en el aviso se abre la tarea.

Los avisos llegan mientras la página esté abierta, aunque esté en otra pestaña o minimizada. Si se bloquearon, se vuelven a permitir desde el candado junto a la dirección de la página.

Si no llegan avisos:

- La campana debe estar activa (sin la raya). Al entrar, la página invita a activarla si aún no se ha dado permiso.
- **Windows**: *Configuración → Sistema → Notificaciones* debe tener activado el navegador (Chrome o Edge), y *No molestar* / *Asistente de concentración* debe estar apagado.
- **macOS**: *Ajustes del Sistema → Notificaciones →* el navegador debe tener los avisos permitidos.
- En celulares (Chrome para Android, Safari en iPhone) estos avisos no funcionan: son para el navegador de escritorio.

## Modo demo

Abre la página con `?demo` al final de la dirección para probarla con datos de ejemplo guardados solo en el navegador.

## Actualización de los datos

Los cambios de otras personas llegan al momento por el tiempo real de Supabase (la tabla `tareas` debe estar en la publicación `supabase_realtime`: **Database → Publications**). Además, la página se resincroniza sola cada `SEGUNDOS_REFRESCO` segundos, al volver a la pestaña y al reconectarse, para recuperar los cambios que el tiempo real no entrega (por ejemplo, mientras el equipo estuvo suspendido).

## Cronómetro de ejecución

Cada tarea mide su **tiempo de ejecución**: empieza a contar cuando sale de *Pendiente* (por ejemplo, pasa a *En progreso*) y se detiene al marcarla *Completada*. Se ve en las tarjetas y en la lista (⏱, en azul mientras corre), en la ventana de la tarea, en la columna **Ejecución prom.** de Rendimiento y en el Excel exportado.

- Si vuelve a *Pendiente*, el cronómetro se reinicia.
- Si se reabre una completada, sigue contando desde el inicio original.
- Si pasa de *Pendiente* a *Completada* directo, no hay tiempo medido.

**Activarlo en Supabase (una vez):** ejecuta `supabase/cronometro.sql` en el **SQL Editor**. Crea la columna `iniciada_at`, el trigger que la mantiene y calcula el inicio de las tareas que ya estaban en curso (con el seguimiento o, si no hay registro, su fecha de creación). Mientras no se ejecute, la página funciona igual pero sin cronómetro; en **Administración → Estado del sistema** se ve si está activo.
