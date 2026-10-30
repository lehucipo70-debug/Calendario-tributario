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

## Actualizar tareas desde Excel

1. En la **Lista**, usa **Exportar a Excel**. La primera columna, **Código (no modificar)**, identifica cada tarea.
2. En el archivo cambia lo que necesites: fechas, estado, prioridad, colaborador, empresa, categoría o descripción. Puedes ordenar y filtrar las filas; no borres ni cambies el código. Para crear tareas nuevas, agrega filas con el código vacío.
3. En **Administración → Seleccionar archivo Excel**, sube el archivo. La página muestra un resumen (cuántas se actualizan, cuántas son nuevas, cuántas siguen igual y los avisos) y solo guarda al confirmar.

- Cada fila con código actualiza **esa misma tarea**; no se duplica. Subir el mismo archivo otra vez no cambia nada.
- "Vencida" en la columna Estado no se guarda (la página la calcula); el estado real se mantiene.
- Solo se lee la hoja que tiene la columna Código; las demás hojas se ignoran.
- Cada cambio queda en el seguimiento de la tarea ("Actualizó desde Excel: fecha límite 3 nov → 5 nov").
- Un archivo exportado antes de este cambio (sin la columna Código) se rechaza, para no crear todas las tareas otra vez.

## Tareas completadas

Las tareas completadas se archivan: dejan de aparecer en el tablero, la lista y el calendario. Para verlas, elige **Estado → Completada** en la barra de filtros (o el botón **Ver completadas** de la columna Completada del tablero). Desde ahí se pueden reabrir. Inicio y Rendimiento siguen contándolas.

## Filtrar por fechas (auditoría)

En la barra de filtros del tablero, la lista y el calendario está el filtro de fechas:

1. Elige qué fecha de la tarea se compara: **Todas las fechas** (por defecto: la tarea entra si vence, se creó o se completó en el rango), **Completadas**, **Creadas**, **Modificadas** o **Que vencen**.
2. Elige el rango con un atajo (**Hoy**, **Ayer**, **Esta semana**, **Semana pasada**, **Este mes**, **Mes pasado**) o con **Desde** y **Hasta**. Ambas fechas están incluidas y se pueden escribir a mano o elegir en el calendario; con solo **Desde** se filtra ese día, y con solo **Hasta**, todo hasta ese día.

Con un rango puesto se ven todas las tareas de esas fechas, también las completadas. Combinado con **Equipo → Colaborador** muestra lo que hizo cada persona en ese periodo. **Modificadas** usa la última modificación de la tarea: si se volvió a cambiar después, cuenta en la fecha del último cambio.

## Avisos de escritorio

La campana de la barra superior activa los avisos del navegador (cada persona los activa en su equipo; el navegador pide permiso la primera vez):

- **Vencimientos**: al entrar y cada 30 minutos avisa de tus tareas vencidas, que vencen hoy o en los próximos días (`DIAS_ALERTA`). Cada tarea avisa una vez al día.
- **Asignaciones**: cuando otra persona te asigna una tarea, llega el aviso al momento.
- **Actividad del equipo** (administradores, y quien creó la tarea): cuando un colaborador completa una tarea, le cambia el estado o crea una nueva, llega el aviso al momento. Los cambios propios no avisan.
- Al hacer clic en el aviso se abre la tarea.

Los avisos llegan mientras la página esté abierta, aunque esté en otra pestaña o minimizada. Si se bloquearon, se vuelven a permitir desde el candado junto a la dirección de la página.

Si no llegan avisos:

- La campana debe estar activa (sin la raya). Al entrar, la página invita a activarla si aún no se ha dado permiso.
- **Windows**: *Configuración → Sistema → Notificaciones* debe tener activado el navegador (Chrome o Edge), y *No molestar* / *Asistente de concentración* debe estar apagado.
- **macOS**: *Ajustes del Sistema → Notificaciones →* el navegador debe tener los avisos permitidos.
- En celulares (Chrome para Android, Safari en iPhone) estos avisos no funcionan: son para el navegador de escritorio.

## Notas personales

La sección **Notas** es un bloc de notas privado: cada persona ve solo las suyas (carpetas Todas, Favoritas, Recientes, Archivadas y Papelera; fijar, favorita, color, buscador y guardado automático).

Para activarla, ejecuta una sola vez [`supabase/notas.sql`](supabase/notas.sql) en Supabase → **SQL Editor**. Mientras no exista la tabla, la sección muestra un aviso.

## Chat del equipo

La sección **Chat** tiene:

- **Canal general (Equipo)**: todos leen y escriben.
- **Grupos**: solo un administrador los crea, les cambia el nombre, el color o los integrantes, o los borra (botón **＋ Grupo** y **Gestionar**). Solo los integrantes leen el grupo.
- **Mensajes directos**: privados de verdad. Solo las dos personas de la conversación los pueden leer; tampoco el administrador.

Cada quien edita o borra solo sus mensajes. Con `@` se menciona a alguien y con el botón de lista se referencia una tarea (se abre al tocarla). Los mensajes llegan al momento, se ve quién está en línea y quién está escribiendo, la pestaña muestra los mensajes sin leer y, con la campana activa, llega un aviso de escritorio por cada mensaje nuevo.

Para activarlo, ejecuta una sola vez [`supabase/chat.sql`](supabase/chat.sql) en Supabase → **SQL Editor**. Mientras no exista, la sección muestra un aviso.

## Clientes

La sección **Clientes** es el directorio de clientes: una lista de nombres y NIT con buscador (nombre, cédula, NIT, código o empresa lechera), filtro por empresa lechera y por vencimientos, y letras A–Z. Al tocar un nombre se despliega la ficha con la cédula y el NIT en renglones separados (persona: su cédula y su NIT, que es el mismo número; empresa: el NIT y la cédula del representante legal, sin su nombre), la empresa lechera (código y nombre), el correo (y un segundo correo), las claves a la vista (correo, correo 2 y DIAN) y tres vencimientos editables con fecha de inicio y de vencimiento: certificado de firma, resolución de facturación y documento soporte. La fila avisa en rojo si algo venció y en amarillo si vence en los próximos 30 días.

- Todos los usuarios ven y editan la ficha, incluidas las claves. Solo los administradores eliminan e importan.
- Para activarla, ejecuta una sola vez [`supabase/clientes.sql`](supabase/clientes.sql) en Supabase → **SQL Editor**.
- **Importar Excel** (administradores) lee la hoja con columnas `CEDULA`, `NIT`, `PRIMER NOMBRE`, `SEGUNDO NOMBRE`, `PRIMER APELLIDO` (y el segundo apellido en la columna siguiente), `EMPRESA LECHERA` (el número inicial se toma como código), `E-MAIL`, `CLAVE E-MAIL`, `CLAVE DIAN`, `VENCIMIENTO CERTIFICADO`, `VENCIMIENTO DE RESOLUCION FACTURACION` y `VENCIMIENTO DOCUMENTO SOPORTE`. Reimportar solo agrega los clientes nuevos: los que ya existen no se modifican.

### Agregar un dato nuevo a la ficha

En `index.html`, la lista `CLIENTE_CAMPOS` define los datos de la ficha y `CLIENTE_VENCIMIENTOS` los vencimientos. Para agregar uno basta con sumar una línea, por ejemplo:

```js
{ id: 'telefono', label: 'Teléfono', tipo: 'telefono', seccion: 'datos', excel: ['TELEFONO'] },
```

No hace falta cambiar Supabase: los campos se guardan en la columna `datos` (jsonb) y los vencimientos en `vencimientos`. Tipos disponibles: `texto`, `correo`, `clave` (oculta, con botones para ver y copiar), `telefono` y `codigo`. Las secciones de la ficha están en `CLIENTE_SECCIONES`.

## Modo demo

Abre la página con `?demo` al final de la dirección para probarla con datos de ejemplo guardados solo en el navegador.

## Actualización de los datos

Los cambios de otras personas llegan al momento por el tiempo real de Supabase (la tabla `tareas` debe estar en la publicación `supabase_realtime`: **Database → Publications**). Además, la página se resincroniza sola cada `SEGUNDOS_REFRESCO` segundos, al volver a la pestaña y al reconectarse, para recuperar los cambios que el tiempo real no entrega (por ejemplo, mientras el equipo estuvo suspendido).

## Cronómetro de ejecución

Cada tarea mide su **tiempo de ejecución**: empieza a contar cuando sale de *Pendiente* (por ejemplo, pasa a *En progreso*) y se detiene al marcarla *Completada*. Se ve en las tarjetas y en la lista (⏱, en azul mientras corre), en la ventana de la tarea, en la columna **Ejecución prom.** de Rendimiento y en el Excel exportado.

- Si vuelve a *Pendiente*, el cronómetro se reinicia.
- Si se reabre una completada, sigue contando desde el inicio original.
- Si pasa de *Pendiente* a *Completada* directo, no hay tiempo medido.

### Pausa (almuerzo, salidas)

Junto al cronómetro, en el Tablero, la Lista y la ventana de la tarea, está el botón de **pausa**. En pausa el cronómetro se ve en ámbar y no avanza; con el botón de **reanudar** sigue desde donde iba. El tiempo en pausa no cuenta en el tiempo de ejecución ni en Rendimiento.

- Si se completa una tarea en pausa, la pausa se cierra sola.
- Si la tarea vuelve a *Pendiente*, se borran el cronómetro y las pausas.
- Pausar y reanudar queda en el seguimiento de la tarea.
- **Activarla en Supabase (una vez):** ejecuta `supabase/pausa.sql` en el **SQL Editor** (después de `cronometro.sql`). En **Administración → Estado del sistema** se ve si está activa.

**Activarlo en Supabase (una vez):** ejecuta `supabase/cronometro.sql` en el **SQL Editor**. Crea la columna `iniciada_at`, el trigger que la mantiene y calcula el inicio de las tareas que ya estaban en curso (con el seguimiento o, si no hay registro, su fecha de creación). Mientras no se ejecute, la página funciona igual pero sin cronómetro; en **Administración → Estado del sistema** se ve si está activo.
