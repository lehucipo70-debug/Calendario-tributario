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

## Revisión antes de cargar

Al subir cualquier Excel de tareas (en **Administración → Seleccionar archivo Excel**) **no se guarda nada** hasta que lo revisas y aceptas. La ventana muestra:

- **Tareas nuevas listas**: se crean al aceptar (se pueden ver en la lista desplegable).
- **Por revisar**: cada una con su motivo y una casilla para crearla o no.
  - *Ya existe una tarea igual* (misma tarea, empresa y fecha límite) o *repetida en el archivo*: vienen **desmarcadas**, para no duplicar.
  - *El colaborador no existe* (queda sin asignar) o *sin fecha límite*: vienen marcadas.
- **Ya cargadas o repetidas**: filas que ya se habían importado antes del mismo archivo; se omiten siempre.
- En archivos con **Código**, también cuántas tareas existentes se actualizan y qué les cambia.

El botón dice exactamente lo que va a hacer (por ejemplo "Aceptar: crear 110 y actualizar 12"). **Cancelar** no cambia nada.

## Copias de seguridad

Antes de cargar un Excel (y antes de restaurar) la página guarda una **copia de todas las tareas**. Se conservan las **5 más recientes**.

- En **Administración → Copias de seguridad** se ven la fecha, quién la hizo, el motivo ("Antes de importar archivo.xlsx") y cuántas tareas creó esa importación. También se puede **crear una copia ahora**.
- **↺ Restaurar** muestra primero qué va a pasar: cuántas tareas vuelven a como estaban, cuántas borradas se recuperan y cuáles se crearon después de la copia. De estas últimas eliges cuáles eliminar (vienen marcadas las que creó una importación de Excel y sin marcar las creadas a mano).
- Restaurar también guarda antes una copia del estado actual, así que se puede deshacer.
- **Activarlo en Supabase (una vez):** ejecuta [`supabase/respaldos.sql`](supabase/respaldos.sql) en el **SQL Editor**. Solo los administradores ven y usan las copias. Si aún no está activo, al importar la página avisa y pregunta si continuar sin copia.

## Actualizar tareas desde Excel

1. En la **Lista**, usa **Exportar a Excel**. La primera columna, **Código (no modificar)**, identifica cada tarea.
2. En el archivo cambia lo que necesites: fechas, estado, prioridad, colaborador, empresa, categoría o descripción. Puedes ordenar y filtrar las filas; no borres ni cambies el código. Para crear tareas nuevas, agrega filas con el código vacío.
3. En **Administración → Seleccionar archivo Excel**, sube el archivo. La página muestra la revisión (cuántas se actualizan, cuántas son nuevas, cuáles revisar y los avisos) y solo guarda al aceptar, después de guardar una copia de seguridad.

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

### NIT en las tareas

El tablero, la lista (columna **NIT**, ordenable), el calendario y la ventana de la tarea muestran el NIT de la empresa de cada tarea. El buscador también encuentra tareas por NIT, y **Exportar a Excel** trae la columna NIT.

- El NIT sale del directorio de Clientes: la tarea se vincula con el cliente que tiene **el mismo nombre que la columna Empresa** (no importan tildes, mayúsculas ni el orden de las palabras). Si se corrige el NIT en la ficha del cliente, cambia en todas sus tareas.
- El nombre se compara sin tildes, mayúsculas, puntos ni el orden de las palabras, y sin la sociedad: "HATO SAMPUES", "Hato Sampués SAS" y "HATO SAMPUES S.A.S." son el mismo cliente.
- **Asociar a mano desde la tarea**: en la ventana de la tarea, el campo **NIT** (junto a Empresa) muestra el NIT de la empresa y se puede escribir o corregir. Al guardar, el NIT queda en el cliente y aplica a todas las tareas de esa empresa: si el cliente existe se le pone (si ya tenía otro, pregunta antes de cambiarlo); si no existe pero el NIT ya es de otro cliente, el nombre de la empresa queda en sus **Otros nombres**; si no hay ninguno, se crea el cliente. Si escribes un NIT conocido con la empresa vacía, se pone el nombre del cliente.
- **Otros nombres** (en la ficha del cliente, **✎ Editar datos**): nombres con que aparece la empresa en las tareas, separados por `;`. Sirve cuando la tarea dice, por ejemplo, "Hato Sampués" y el cliente se llama "Agropecuaria Hato Sampués".
- Si la empresa no está en el directorio, se usa el NIT escrito en la descripción de la tarea (`NIT 900123456 · …`), si lo hay.
- Los cambios de NIT de otras personas se ven en la siguiente resincronización (o al recargar).
- **Vincular los NIT desde Excel** (administradores): en **Clientes → Importar Excel** sube un archivo con las columnas `EMPRESA` y `NIT` (por ejemplo, la lista de tareas exportada con la columna NIT). Antes de guardar muestra un resumen:
  - las empresas que no están en el directorio se crean como clientes con su nombre y NIT;
  - los clientes que estaban sin NIT lo reciben;
  - si el nombre está escrito distinto pero el NIT ya existe, ese nombre queda como alias del cliente;
  - si el cliente ya tiene **otro** NIT, no se cambia (sale en los avisos para revisarlo en su ficha).
- En la celda NIT se toma el primer número de 5 o más dígitos (`NIT 900705082 YCC. …` → `900705082`).

### Impuestos DIAN

En la ficha de cada cliente, dentro de **Vencimientos**, está el apartado **🏛 Impuestos DIAN 2026**. No crea tareas ni toca el tablero.

- **✎ Impuestos asociados** despliega las obligaciones (IVA bimestral, retención en la fuente, IVA cuatrimestral, renta, Régimen Simple, exógena); se marcan o desmarcan con un toque y se guarda al momento.
- **Predeterminado**: persona natural → IVA bimestral; empresa (NIT de 9 dígitos que empieza por 8 o 9) → IVA bimestral y retención en la fuente. Mientras no se toque, el cliente sigue lo predeterminado; si se personaliza, se puede volver a lo predeterminado.
- Cada obligación muestra su **próxima fecha** según el último dígito del NIT (renta de personas naturales y exógena, los dos últimos) y "Todas las fechas" del año. Amarillo si vence en 10 días o menos (`DIAN_DIAS_ALERTA`), rojo el día del vencimiento. La fila del cliente y el filtro **Vencimientos** también los tienen en cuenta.
- **🏛 Vencimientos DIAN** (en la barra de Clientes): todos los vencimientos de todos los clientes ordenados por fecha (hoy, próximos 7 días, próximos 30 días), con filtro por obligación y enlace al PDF oficial.
- Las fechas están en `CALENDARIO_DIAN` en `index.html`, copiadas del [Calendario Tributario 2026 de la DIAN](https://www.dian.gov.co/Calendarios/Calendario_Tributario_2026.pdf): IVA bimestral, IVA cuatrimestral, retención en la fuente, renta de personas jurídicas (2 cuotas), de personas naturales (por los dos últimos dígitos) y Régimen Simple (anticipos bimestrales, declaración anual consolidada y consolidada de IVA). La exógena no está en ese PDF: sus fechas salen de otra resolución de la DIAN y aún no están cargadas. Cada año se reemplaza con el calendario nuevo.

### Tabla de vencimientos en Supabase

[`supabase/vencimientos.sql`](supabase/vencimientos.sql) (ejecutar una vez en el **SQL Editor**, después de `clientes.sql`) crea:

- **`calendario_dian`**: las fechas del Calendario Tributario (obligación, periodo, dígito del NIT y fecha). La página toma el calendario de aquí; si la tabla no existe, usa el que trae `index.html`.
- **`vencimientos`**: los vencimientos de cada cliente (cliente, NIT, obligación, periodo y fecha). **Se mantiene sola**:
  - al crear un cliente (a mano, al importar o al vincular NIT) se generan sus vencimientos;
  - al cambiarle el NIT o los impuestos asociados (en la ficha), se recalculan;
  - al eliminar el cliente, se borran;
  - al cambiar el calendario, se recalculan los de todos.

Al ejecutarlo se generan los vencimientos de los clientes que ya existen. Todos los usuarios los pueden leer; solo los triggers los escriben.

**Año nuevo**: insertar en `calendario_dian` las filas del año nuevo (mismo formato); los vencimientos se recalculan solos y la página muestra el año más reciente.

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
