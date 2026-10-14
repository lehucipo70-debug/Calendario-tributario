# Planner del Equipo

Planner de tareas para el equipo: cada colaborador registra sus tareas y les da seguimiento, y la página muestra el rendimiento de cada uno. Reemplaza al antiguo *Calendario Tributario*: ya no hay contadores, ahora hay **colaboradores**, y las obligaciones tributarias pasan a ser **tareas** (categoría *Tributario*).

## Qué incluye

| Vista | Para qué sirve |
|---|---|
| **Inicio** | "Mi día": tareas vencidas, para hoy y de la semana, captura rápida (escribe y Enter) e índice de rendimiento del mes. |
| **Tablero** | Kanban estilo Planner. Agrupa por estado, colaborador o prioridad; arrastra tarjetas para cambiar estado, reasignar o repriorizar. |
| **Lista** | Tabla ordenable con búsqueda, filtros, cambio rápido de estado y exportación a Excel. |
| **Calendario** | Vista de mes o semana. Clic en un día crea una tarea con esa fecha; arrastrar una tarea a otro día la reprograma. Color por colaborador. |
| **Rendimiento** | Indicadores por colaborador (tabla + gráficas): cumplimiento, puntualidad, vencidas, días promedio e índice. Filtra por semana, mes, trimestre, año. |
| **Colaboradores** | Carga de trabajo actual de cada persona y acceso directo para asignarle tareas. |
| **Administración** | Importar/exportar Excel y estado del sistema (solo administradores). |

Cada tarea tiene responsable, prioridad, categoría, empresa/cliente, fechas de inicio y límite, **lista de verificación** (el progreso se calcula solo) y una **bitácora de seguimiento** con comentarios y cambios (quién cambió el estado, la fecha o la asignación).

Además: tiempo real entre usuarios (Supabase Realtime), tema claro/oscuro, diseño adaptable a celular, "Deshacer" en los cambios rápidos, tecla **N** para nueva tarea y notificaciones opcionales a Microsoft Teams.

## Índice de rendimiento

Definido en `js/metricas.js`:

- **Evaluables** = tareas completadas + tareas vencidas sin completar (las que aún no vencen no cuentan ni a favor ni en contra).
- **Cumplimiento** = completadas ÷ evaluables.
- **Puntualidad** = completadas a tiempo ÷ completadas con fecha límite.
- **Índice** = 50 % cumplimiento + 50 % puntualidad → Excelente (≥ 85), Bueno (≥ 70), Regular (≥ 50), Bajo.

La fecha de completado la fija la base de datos (no el navegador), para que nadie pueda alterar su puntualidad.

## Puesta en marcha con Supabase

1. En Supabase → **SQL Editor**, ejecuta `supabase/schema.sql`. Crea las tablas `tareas` y `tarea_actividad` y deja RLS activado.
2. Configura tus permisos (políticas RLS). Si quieres un punto de partida, `supabase/permisos-ejemplo.sql` deja a todos ver al equipo, a cada uno editar lo suyo y a los administradores, todo.
3. *(Opcional)* Ejecuta `supabase/migrar-obligaciones.sql` para convertir las obligaciones del calendario anterior en tareas. No modifica la tabla `obligaciones` y se puede correr varias veces sin duplicar.
4. Publica la carpeta (GitHub Pages, Netlify o cualquier hosting estático) o abre `index.html`.

Los colaboradores salen de la tabla `perfiles` (`id`, `nombre`, `rol`, `correo`). Los roles `admin`, `lider` y `supervisor` se tratan como administradores; cualquier otro (incluido el antiguo `contador`) es colaborador.

### Permisos

Supabase es quien permite o niega cada lectura y escritura. La página solo decide qué botones mostrar (`js/permisos.js`), y si la base de datos rechaza un cambio, la página lo revierte y avisa. Dos opciones en `js/config.js`:

- `COLABORADORES_VEN_EQUIPO`: un colaborador puede ver las tareas del equipo (además de las suyas).
- `COLABORADORES_ASIGNAN_A_OTROS`: un colaborador puede asignar tareas a otras personas.

## Modo demo

Abre `index.html?demo=1` para probar sin tocar datos reales: genera un equipo y tareas de ejemplo y guarda todo en el navegador. Entra como `admin@demo.co` (administrador) o `ana@demo.co` (colaboradora), con cualquier contraseña.

## Importar desde Excel

Administración → Importar acepta dos formatos:

- **Planner**: columnas `TAREA`/`TITULO`, `COLABORADOR`/`RESPONSABLE`, `FECHA` y opcionales `EMPRESA`, `CATEGORIA`, `PRIORIDAD`, `ESTADO`, `DESCRIPCION`, `FECHA INICIO`.
- **Calendario tributario anterior**: `EMPRESA`, `CONTADOR`, `TIPO DE IMPUESTO`, `PERÍODO`, `FECHA VENCIMIENTO`, o el formato con una columna por mes.

El colaborador se asocia por nombre con `perfiles`. Si un nombre no existe, la tarea queda sin asignar y el nombre se conserva. Reimportar el mismo archivo no crea duplicados.

## Estructura del código

```
index.html              Estructura de la página y orden de carga
css/styles.css          Estilos (tokens de color claro/oscuro arriba)
js/config.js            Configuración: Supabase, Teams, roles, estados, prioridades
js/utils.js             Utilidades puras (fechas locales, formato, escape HTML)
js/metricas.js          Cálculo de rendimiento (puro, con pruebas)
js/permisos.js          Qué ve y puede intentar cada rol
js/datos.js             Capa de datos: SupabaseStore (producción) y LocalStore (demo)
js/teams.js             Notificaciones a Microsoft Teams
js/componentes.js       Piezas de interfaz reutilizables (tarjeta, chips, filtros, modal, avisos)
js/vistas/*.js          Una vista por archivo (inicio, tablero, lista, calendario, rendimiento, colaboradores, admin)
js/tarea-modal.js       Ventana de tarea: edición, lista de verificación y seguimiento
js/importar.js          Importar/exportar Excel
js/login.js             Inicio de sesión y fondo 3D
js/app.js               Estado, acciones, eventos y arranque
supabase/*.sql          Esquema, permisos de ejemplo y migración
tests/                  Pruebas unitarias, de navegador y de SQL
```

Flujo: un evento del usuario → una acción de `App` → `Datos` (Supabase o demo) → `App.render()` vuelve a pintar la vista activa. No hay paso de compilación: son archivos estáticos que funcionan abiertos directamente o desde cualquier hosting.

## Pruebas

```bash
npm install
npm test            # unitarias + navegador (Chromium)
npm run test:sql    # scripts SQL contra un PostgreSQL local temporal
```

- **Unitarias** (`tests/unit.test.js`): métricas, fechas y conversión de Excel a tareas.
- **Navegador** (`tests/e2e.js`): recorre todas las vistas como administrador, colaboradora y en celular, y prueba el modo Supabase contra un servidor simulado (inicio de sesión, más de 1000 tareas, permisos denegados, tablas faltantes). Guarda capturas en `tests/capturas/`.
- **SQL** (`tests/sql/`): ejecuta `schema.sql`, `permisos-ejemplo.sql` y la migración dos veces cada uno, y verifica la migración, el trigger de completado y los permisos por rol.

## Microsoft Teams

En `js/config.js`, `TEAMS_WEBHOOK_URL` (canal general) y `TEAMS_WEBHOOKS_POR_COLABORADOR` (un canal por persona). Avisa cuando se asigna una tarea a otra persona y cuando se completa una. **No subas la URL real a un repositorio público**: incluye una firma secreta que permite publicar en tu canal.
