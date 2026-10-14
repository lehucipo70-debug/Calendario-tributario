// ═══════════════════════════════════════════════════════════════════
// COMPONENTES DE INTERFAZ — piezas HTML reutilizadas por todas las vistas
// ═══════════════════════════════════════════════════════════════════

// Registro de vistas. Cada archivo de js/vistas/ agrega la suya:
//   Vistas.x = { titulo, icono, orden, visible(), render(), montar?() }
const Vistas = {};

const UI = {
  // ── Colaboradores ──────────────────────────────────────────────────
  colorColaborador(id) {
    const idx = App.estado.colaboradores.findIndex(c => c.id === id);
    if (idx < 0) return 'var(--text3)';
    const paleta = App.estado.tema === 'oscuro' ? PALETA_COLABORADORES.oscuro : PALETA_COLABORADORES.claro;
    return paleta[idx % paleta.length];
  },

  avatar(t_o_colab, tam = 26) {
    const c = t_o_colab?.titulo !== undefined ? App.colaboradorDe(t_o_colab) : t_o_colab;
    const nombre = c?.nombre || 'Sin asignar';
    const color = c?.id ? UI.colorColaborador(c.id) : null;
    const fondo = color && color.startsWith('#') ? color : 'var(--bg3)';
    const texto = color && color.startsWith('#') ? Util.textoSobre(color) : 'var(--text2)';
    return `<span class="avatar" title="${Util.esc(nombre)}" style="width:${tam}px;height:${tam}px;font-size:${Math.round(tam * 0.4)}px;background:${fondo};color:${texto}">${c ? Util.esc(Util.iniciales(nombre)) : '?'}</span>`;
  },

  // ── Chips ──────────────────────────────────────────────────────────
  prioridad(p) {
    const def = PRIORIDADES.find(x => x.id === p) || PRIORIDADES[2];
    return `<span class="chip prio-${def.id}">${def.icon} ${def.label}</span>`;
  },

  estado(t) {
    const ef = Metricas.estadoEfectivo(t, Util.hoyISO());
    if (ef === 'vencida') return `<span class="chip est-vencida">⚠ Vencida</span>`;
    const def = ESTADOS.find(x => x.id === ef) || ESTADOS[0];
    return `<span class="chip est-${def.id}">${def.icon} ${def.label}</span>`;
  },

  // Insignia del índice de rendimiento (ícono + número + texto: nunca solo color)
  nivel(indice, { texto = false } = {}) {
    const n = Metricas.nivel(indice);
    if (indice === null || indice === undefined) return `<span class="nivel nivel-na" title="Sin tareas evaluables en el periodo">Sin datos</span>`;
    return `<span class="nivel nivel-${n.id}" title="Índice ${indice} · ${n.label}">${n.icon} ${indice}${texto ? ` <small>${n.label}</small>` : ''}</span>`;
  },

  fecha(t) {
    if (!t.fecha_vencimiento) return '<span class="fecha muted">Sin fecha</span>';
    const hoy = Util.hoyISO();
    let cls = '';
    if (t.estado !== 'completada') {
      if (t.fecha_vencimiento < hoy) cls = 'vencida';
      else if (Metricas.porVencer(t, hoy)) cls = 'pronto';
    }
    return `<span class="fecha ${cls}" title="${Util.fmtFecha(t.fecha_vencimiento)}">📅 ${Util.fmtRelativa(t.fecha_vencimiento)}</span>`;
  },

  progreso(t) {
    const total = t.checklist.length;
    const hechos = t.checklist.filter(i => i.hecho).length;
    const pct = total ? Util.pct(hechos, total) : (t.estado === 'completada' ? 100 : t.progreso);
    return { pct, texto: total ? `${hechos}/${total}` : `${pct}%` };
  },

  // ── Tarjeta de tarea (tablero, inicio, calendario semanal) ─────────
  tarjeta(t, { arrastrable = true } = {}) {
    const p = UI.progreso(t);
    const hecha = t.estado === 'completada';
    const puede = Permisos.editarTarea(t);
    return `<article class="tarjeta prio-borde-${t.prioridad} ${hecha ? 'hecha' : ''}" data-accion="abrir-tarea" data-id="${t.id}"
        ${arrastrable && puede ? 'draggable="true"' : ''} data-arrastrar="${t.id}">
      <div class="tarjeta-top">
        ${UI.prioridad(t.prioridad)}
        ${t.categoria ? `<span class="chip chip-suave">${Util.esc(t.categoria)}</span>` : ''}
        ${puede ? `<button class="check ${hecha ? 'on' : ''}" data-accion="completar" data-id="${t.id}" title="${hecha ? 'Reabrir tarea' : 'Marcar como completada'}" aria-label="${hecha ? 'Reabrir tarea' : 'Completar tarea'}">✓</button>` : ''}
      </div>
      <h4 class="tarjeta-titulo">${Util.esc(t.titulo)}</h4>
      ${t.empresa ? `<div class="tarjeta-empresa">🏢 ${Util.esc(t.empresa)}</div>` : ''}
      ${p.pct > 0 && !hecha ? `<div class="mini-barra"><span style="width:${p.pct}%"></span></div>` : ''}
      <div class="tarjeta-pie">
        ${UI.fecha(t)}
        <span class="pie-der">
          ${t.checklist.length ? `<span class="muted" title="Lista de verificación">☑ ${p.texto}</span>` : ''}
          ${UI.avatar(t)}
        </span>
      </div>
    </article>`;
  },

  // ── Barra de filtros (tablero, lista, calendario) ──────────────────
  filtros() {
    const f = App.estado.filtros;
    const sel = (campo, etiqueta, opciones) => `<select data-filtro="${campo}" aria-label="${etiqueta}">
        <option value="">${etiqueta}</option>
        ${opciones.map(([v, l]) => `<option value="${Util.esc(v)}" ${f[campo] === v ? 'selected' : ''}>${Util.esc(l)}</option>`).join('')}
      </select>`;
    const colabs = App.estado.colaboradores.map(c => [c.id, c.nombre]);
    const activos = ['texto', 'colaborador', 'estado', 'prioridad', 'categoria'].some(k => f[k]);
    return `<div class="barra-filtros">
      ${Permisos.verEquipo() ? `<div class="segmentado" role="group" aria-label="Alcance">
        <button class="${f.alcance === 'mias' ? 'on' : ''}" data-accion="alcance" data-valor="mias">Mis tareas</button>
        <button class="${f.alcance === 'equipo' ? 'on' : ''}" data-accion="alcance" data-valor="equipo">Equipo</button>
      </div>` : ''}
      <input type="search" data-filtro="texto" placeholder="🔍 Buscar tarea o empresa…" value="${Util.esc(f.texto)}" aria-label="Buscar">
      ${f.alcance === 'equipo' ? sel('colaborador', 'Colaborador', colabs) : ''}
      ${sel('estado', 'Estado', [...ESTADOS.map(e => [e.id, e.label]), ['vencida', 'Vencida']])}
      ${sel('prioridad', 'Prioridad', PRIORIDADES.map(p => [p.id, p.label]))}
      ${sel('categoria', 'Categoría', App.categorias().map(c => [c, c]))}
      ${activos ? '<button class="btn btn-sm" data-accion="limpiar-filtros">✕ Limpiar</button>' : ''}
    </div>`;
  },

  vacio(icono, titulo, texto, accion = '') {
    return `<div class="vacio"><div class="vacio-icono">${icono}</div><h3>${titulo}</h3><p>${texto}</p>${accion}</div>`;
  },

  // ── Notificaciones ─────────────────────────────────────────────────
  toast(msg, { tipo = 'info', deshacer = null, ms = 4500 } = {}) {
    const ct = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast toast-' + tipo;
    el.setAttribute('role', 'status');
    el.innerHTML = `<span>${Util.esc(msg)}</span>`;
    if (deshacer) {
      const b = document.createElement('button');
      b.textContent = 'Deshacer';
      b.onclick = () => { el.remove(); deshacer(); };
      el.appendChild(b);
    }
    ct.appendChild(el);
    while (ct.children.length > 3) ct.firstElementChild.remove(); // solo las 3 más recientes
    setTimeout(() => el.remove(), ms);
  },

  // ── Modal genérico ─────────────────────────────────────────────────
  abrirModal(html, { ancho = 560, alCerrar = null } = {}) {
    const capa = document.getElementById('modal');
    capa.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:${ancho}px">${html}</div>`;
    capa.hidden = false;
    UI._alCerrar = alCerrar;
    setTimeout(() => capa.querySelector('[autofocus]')?.focus(), 30);
  },

  cerrarModal() {
    const capa = document.getElementById('modal');
    if (capa.hidden) return;
    capa.hidden = true;
    capa.innerHTML = '';
    const fn = UI._alCerrar; UI._alCerrar = null;
    fn?.();
  },
};
