// ═══════════════════════════════════════════════════════════════════
// VISTA: CALENDARIO — mes o semana, estilo planner.
// Clic en un día crea una tarea con esa fecha; arrastrar una tarea a
// otro día la reprograma.
// ═══════════════════════════════════════════════════════════════════

Vistas.calendario = {
  titulo: 'Calendario',
  icono: '📅',
  orden: 4,
  visible: () => true,
  MAX_POR_DIA: 3,

  porDia(tareas) {
    const m = new Map();
    for (const t of tareas) {
      if (!t.fecha_vencimiento) continue;
      if (!m.has(t.fecha_vencimiento)) m.set(t.fecha_vencimiento, []);
      m.get(t.fecha_vencimiento).push(t);
    }
    const peso = t => (t.estado === 'completada' ? 10 : 0) + PRIORIDADES.findIndex(p => p.id === t.prioridad);
    for (const l of m.values()) l.sort((a, b) => peso(a) - peso(b));
    return m;
  },

  chip(t, hoy) {
    const ef = Metricas.estadoEfectivo(t, hoy);
    const c = App.colaboradorDe(t);
    const color = c?.id ? UI.colorColaborador(c.id) : 'var(--text3)';
    const puede = Permisos.editarTarea(t);
    const prio = PRIORIDADES.find(p => p.id === t.prioridad);
    return `<button class="ev ev-${ef}" data-accion="abrir-tarea" data-id="${t.id}" ${puede ? 'draggable="true"' : ''} data-arrastrar="${t.id}"
        title="${Util.esc(t.titulo)} · ${Util.esc(c?.nombre || 'Sin asignar')} · ${prio?.label}">
      <span class="ev-punto" style="background:${color}"></span>
      ${t.prioridad === 'urgente' || t.prioridad === 'alta' ? `<span class="ev-prio" aria-hidden="true">${prio.icon}</span>` : ''}
      <span class="ev-texto">${Util.esc(t.titulo)}</span>
    </button>`;
  },

  render() {
    const s = App.estado.cal;
    const hoy = Util.hoyISO();
    const tareas = App.tareasVisibles();
    const porDia = this.porDia(tareas);
    const ref = Util.deISO(s.ref);

    let titulo, cuerpo;
    if (s.modo === 'semana') {
      const ini = Util.inicioSemana(s.ref);
      const fin = Util.sumarDias(ini, 6);
      const a = Util.deISO(ini), b = Util.deISO(fin);
      titulo = `${a.getDate()} ${Util.MESES_CORTOS[a.getMonth()]} – ${b.getDate()} ${Util.MESES_CORTOS[b.getMonth()]} ${b.getFullYear()}`;
      cuerpo = `<div class="semana">${[0, 1, 2, 3, 4, 5, 6].map(i => {
        const iso = Util.sumarDias(ini, i);
        const d = Util.deISO(iso);
        const lista = porDia.get(iso) || [];
        return `<section class="semana-dia ${iso === hoy ? 'es-hoy' : ''} ${i >= 5 ? 'finde' : ''}" data-soltar="fecha_vencimiento" data-valor="${iso}">
          <header><span class="dia-nombre">${Util.DIAS_CORTOS[i]}</span><span class="dia-num">${d.getDate()}</span>
            <button class="btn-icono btn-sm" data-accion="nueva-tarea" data-fecha="${iso}" aria-label="Agregar tarea el ${d.getDate()}">＋</button></header>
          <div class="semana-cuerpo">${lista.map(t => UI.tarjeta(t)).join('') || '<p class="columna-vacia">—</p>'}</div>
        </section>`;
      }).join('')}</div>`;
    } else {
      const y = ref.getFullYear(), mes = ref.getMonth();
      titulo = `${Util.MESES[mes]} ${y}`;
      const primero = new Date(y, mes, 1);
      const inicio = Util.sumarDias(Util.aISO(primero), -((primero.getDay() + 6) % 7));
      const semanas = Math.ceil((((primero.getDay() + 6) % 7) + new Date(y, mes + 1, 0).getDate()) / 7);
      let celdas = '';
      for (let i = 0; i < semanas * 7; i++) {
        const iso = Util.sumarDias(inicio, i);
        const d = Util.deISO(iso);
        const lista = porDia.get(iso) || [];
        const abiertas = lista.filter(t => t.estado !== 'completada').length;
        const extra = lista.length - this.MAX_POR_DIA;
        celdas += `<div class="dia ${d.getMonth() !== mes ? 'fuera' : ''} ${iso === hoy ? 'es-hoy' : ''} ${i % 7 >= 5 ? 'finde' : ''}"
            data-soltar="fecha_vencimiento" data-valor="${iso}" data-accion="nueva-tarea" data-fecha="${iso}" title="Clic para agregar una tarea">
          <div class="dia-cab"><span class="dia-num">${d.getDate()}</span>${abiertas ? `<span class="dia-carga" title="${abiertas} abiertas">${abiertas}</span>` : ''}</div>
          ${lista.slice(0, extra > 0 ? this.MAX_POR_DIA - 1 : this.MAX_POR_DIA).map(t => this.chip(t, hoy)).join('')}
          ${extra > 0 ? `<button class="ev-mas" data-accion="ver-dia" data-fecha="${iso}">+${extra + 1} más</button>` : ''}
        </div>`;
      }
      cuerpo = `<div class="mes">
        ${Util.DIAS_CORTOS.map((n, i) => `<div class="mes-cab ${i >= 5 ? 'finde' : ''}">${n}</div>`).join('')}
        ${celdas}
      </div>`;
    }

    const sinFecha = tareas.filter(t => !t.fecha_vencimiento && t.estado !== 'completada');
    const colabsVisibles = [...new Map(tareas.map(t => App.colaboradorDe(t)).filter(c => c?.id).map(c => [c.id, c])).values()];

    return `${UI.filtros()}
      <div class="cal-barra">
        <div class="cal-nav">
          <button class="btn-icono" data-accion="cal-mover" data-dir="-1" aria-label="Anterior">‹</button>
          <button class="btn btn-sm" data-accion="cal-hoy">Hoy</button>
          <button class="btn-icono" data-accion="cal-mover" data-dir="1" aria-label="Siguiente">›</button>
          <h2 class="cal-titulo">${titulo}</h2>
        </div>
        <div class="segmentado" role="group" aria-label="Vista del calendario">
          <button class="${s.modo === 'mes' ? 'on' : ''}" data-accion="cal-modo" data-valor="mes">Mes</button>
          <button class="${s.modo === 'semana' ? 'on' : ''}" data-accion="cal-modo" data-valor="semana">Semana</button>
        </div>
      </div>
      ${colabsVisibles.length > 1 ? `<div class="leyenda">${colabsVisibles.map(c => `<span class="leyenda-item"><span class="ev-punto" style="background:${UI.colorColaborador(c.id)}"></span>${Util.esc(c.nombre)}</span>`).join('')}
        <span class="leyenda-item"><span class="ev ev-vencida ev-muestra">Vencida</span></span><span class="leyenda-item"><span class="ev ev-completada ev-muestra">Completada</span></span></div>` : ''}
      ${cuerpo}
      ${sinFecha.length ? `<section class="panel mt"><header class="panel-cab"><h3>Sin fecha límite</h3><span class="contador">${sinFecha.length}</span><span class="muted mini">Arrástralas a un día para programarlas</span></header>
        <div class="fila-tarjetas">${sinFecha.slice(0, 12).map(t => UI.tarjeta(t)).join('')}</div></section>` : ''}`;
  },

  acciones: {
    'cal-mover': el => {
      const s = App.estado.cal;
      const dir = +el.dataset.dir;
      if (s.modo === 'semana') s.ref = Util.sumarDias(s.ref, 7 * dir);
      else { const d = Util.deISO(s.ref); s.ref = Util.aISO(new Date(d.getFullYear(), d.getMonth() + dir, 1)); }
      App.render();
    },
    'cal-hoy': () => { App.estado.cal.ref = Util.hoyISO(); App.render(); },
    'cal-modo': el => { App.estado.cal.modo = el.dataset.valor; App.render(); },
    'ver-dia': el => {
      const iso = el.dataset.fecha;
      const lista = Vistas.calendario.porDia(App.tareasVisibles()).get(iso) || [];
      const d = Util.deISO(iso);
      UI.abrirModal(`<header class="modal-cab"><h3>${d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          <button class="btn-icono" data-accion="cerrar-modal" aria-label="Cerrar">✕</button></header>
        <div class="lista-tarjetas">${lista.map(t => UI.tarjeta(t, { arrastrable: false })).join('')}</div>
        <div class="modal-pie"><button class="btn btn-primario" data-accion="nueva-tarea" data-fecha="${iso}">＋ Agregar tarea este día</button></div>`, { ancho: 520 });
    },
  },
};
