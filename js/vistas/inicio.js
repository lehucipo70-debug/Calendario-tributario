// ═══════════════════════════════════════════════════════════════════
// VISTA: INICIO ("Mi día")
// ═══════════════════════════════════════════════════════════════════

Vistas.inicio = {
  titulo: 'Inicio',
  icono: '🏠',
  orden: 1,
  visible: () => true,

  render() {
    const hoy = Util.hoyISO();
    const perfil = App.estado.perfil;
    const mias = App.estado.tareas.filter(t => App.esMia(t));
    const abiertas = mias.filter(t => t.estado !== 'completada');
    const vencidas = abiertas.filter(t => t.fecha_vencimiento && t.fecha_vencimiento < hoy);
    const paraHoy = abiertas.filter(t => t.fecha_vencimiento === hoy);
    const semana = abiertas.filter(t => t.fecha_vencimiento > hoy && t.fecha_vencimiento <= Util.sumarDias(hoy, 7));
    const sinFecha = abiertas.filter(t => !t.fecha_vencimiento);
    const inicioSem = Util.inicioSemana(hoy);
    const hechasSemana = mias.filter(t => t.estado === 'completada' && (Util.fechaDeTimestamp(t.completada_at) || '') >= inicioSem).length;
    const m = Metricas.calcular(mias.filter(t => Metricas.enRango(t, Metricas.rangoPeriodo('mes', hoy))), hoy);

    const f = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
    const fechaLarga = f[0].toUpperCase() + f.slice(1);
    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

    const seccion = (titulo, lista, cls, vacioTxt) => `
      <section class="panel">
        <header class="panel-cab"><h3>${titulo}</h3><span class="contador ${cls}">${lista.length}</span></header>
        <div class="lista-tarjetas">${lista.length ? lista.slice(0, 8).map(t => UI.tarjeta(t, { arrastrable: false })).join('') : `<p class="muted pad">${vacioTxt}</p>`}
        ${lista.length > 8 ? `<button class="btn btn-sm ancho" data-accion="ver-colaborador" data-id="${perfil.id}">Ver las ${lista.length}</button>` : ''}</div>
      </section>`;

    return `
    <div class="hero">
      <div>
        <p class="hero-fecha">${Util.esc(fechaLarga)}</p>
        <h2>${saludo}, ${Util.esc(perfil.nombre.split(' ')[0])}</h2>
        <p class="muted">${abiertas.length ? `Tienes ${abiertas.length} tarea${abiertas.length === 1 ? '' : 's'} abierta${abiertas.length === 1 ? '' : 's'}${vencidas.length ? `, <strong class="txt-rojo">${vencidas.length} vencida${vencidas.length === 1 ? '' : 's'}</strong>` : ''}.` : 'No tienes tareas abiertas. ¡Buen trabajo!'}</p>
        <form class="captura-rapida" data-captura>
          <input name="titulo" placeholder="＋ Escribe una tarea y presiona Enter (vence hoy)" aria-label="Nueva tarea rápida" autocomplete="off" maxlength="300">
        </form>
      </div>
      ${m.indice === null && Permisos.verRendimientoEquipo()
        ? Vistas.inicio.anillo(Metricas.resumenEquipo(Metricas.porColaborador(App.estado.tareas, App.estado.colaboradores, { periodo: 'mes', hoy })).indicePromedio, 'Índice del equipo (mes)')
        : Vistas.inicio.anillo(m.indice, 'Tu índice del mes')}
    </div>

    <div class="kpis">
      ${Vistas.inicio.kpi('Vencidas', vencidas.length, 'rojo', '⚠')}
      ${Vistas.inicio.kpi('Para hoy', paraHoy.length, 'ambar', '◷')}
      ${Vistas.inicio.kpi('Próximos 7 días', semana.length, 'azul', '📅')}
      ${Vistas.inicio.kpi('Completadas esta semana', hechasSemana, 'verde', '✓')}
    </div>

    <div class="rejilla-3">
      ${seccion('⚠ Vencidas', vencidas, 'rojo', 'Nada vencido. 🎉')}
      ${seccion('◷ Hoy', paraHoy, 'ambar', 'Nada programado para hoy.')}
      ${seccion('📅 Próximos 7 días', semana, 'azul', 'Semana despejada.')}
    </div>
    ${sinFecha.length ? `<div class="mt">${seccion('Sin fecha límite', sinFecha, '', '')}</div>` : ''}
    ${Permisos.verRendimientoEquipo() ? Vistas.inicio.resumenEquipo(hoy) : ''}`;
  },

  kpi(etiqueta, valor, color, icono) {
    return `<div class="kpi kpi-${color}"><span class="kpi-icono" aria-hidden="true">${icono}</span><div><div class="kpi-valor">${valor}</div><div class="kpi-etiqueta">${etiqueta}</div></div></div>`;
  },

  // Anillo de progreso (SVG) para un índice 0–100
  anillo(valor, etiqueta) {
    const r = 42, c = 2 * Math.PI * r;
    const v = valor ?? 0;
    const n = Metricas.nivel(valor);
    return `<div class="anillo" title="${etiqueta}: ${valor ?? 'sin datos'}">
      <svg viewBox="0 0 100 100" width="118" height="118" aria-hidden="true">
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--bg3)" stroke-width="9"/>
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--nivel-${n.id})" stroke-width="9" stroke-linecap="round"
          stroke-dasharray="${(c * v / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/>
      </svg>
      <div class="anillo-centro"><strong>${valor ?? '—'}</strong><span>${n.icon} ${n.label}</span></div>
      <div class="anillo-etiqueta">${etiqueta}</div>
    </div>`;
  },

  resumenEquipo(hoy) {
    const filas = Metricas.porColaborador(App.estado.tareas, App.estado.colaboradores, { periodo: 'mes', hoy })
      .filter(f => f.colaborador && f.total > 0)
      .sort((a, b) => (b.indice ?? -1) - (a.indice ?? -1));
    if (!filas.length) return '';
    return `<section class="panel mt">
      <header class="panel-cab"><h3>👥 Equipo este mes</h3><button class="btn btn-sm" data-accion="ir" data-vista="rendimiento">Ver rendimiento →</button></header>
      <div class="equipo-mini">${filas.map(f => {
        return `<button class="equipo-fila" data-accion="ver-colaborador" data-id="${f.clave}">
          ${UI.avatar(f.colaborador, 28)}<span class="equipo-nombre">${Util.esc(f.nombre)}</span>
          <span class="muted">${f.completadas}/${f.total} · ${f.vencidas ? `<span class="txt-rojo">${f.vencidas} vencidas</span>` : 'al día'}</span>
          ${UI.nivel(f.indice)}</button>`;
      }).join('')}</div>
    </section>`;
  },

  montar(main) {
    const form = main.querySelector('[data-captura]');
    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const titulo = form.titulo.value.trim();
      if (!titulo) return;
      form.titulo.disabled = true;
      try {
        await App.crear({ titulo, fecha_vencimiento: Util.hoyISO() });
      } catch (err) { UI.toast(err.message, { tipo: 'error' }); }
      // El render posterior reemplaza el formulario; se devuelve el foco al nuevo.
      requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector('[data-captura] input')?.focus()));
    });
  },

  errorCarga(e) {
    if (e.faltaEsquema) {
      return UI.vacio('🛠️', 'Falta configurar la base de datos',
        `El planner necesita las tablas <code>tareas</code> y <code>tarea_actividad</code> en Supabase.<br>
         Abre el <strong>SQL Editor</strong> de Supabase, ejecuta el archivo <code>supabase/schema.sql</code> del repositorio y luego tus políticas de permisos.`,
        '<button class="btn btn-primario" data-accion="sincronizar">Reintentar</button>');
    }
    return UI.vacio('⚠️', 'No se pudieron cargar las tareas', Util.esc(e.message), '<button class="btn btn-primario" data-accion="sincronizar">Reintentar</button>');
  },
};
