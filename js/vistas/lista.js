// ═══════════════════════════════════════════════════════════════════
// VISTA: LISTA — tabla ordenable con cambio rápido de estado
// ═══════════════════════════════════════════════════════════════════

Vistas.lista = {
  titulo: 'Lista',
  icono: '☰',
  orden: 3,
  visible: () => true,

  COLUMNAS: [
    ['titulo', 'Tarea'], ['asignado', 'Colaborador'], ['empresa', 'Empresa'], ['prioridad', 'Prioridad'],
    ['estado', 'Estado'], ['fecha_vencimiento', 'Vence'], ['progreso', 'Progreso'],
  ],

  ordenar(lista) {
    const { orden, dir } = App.estado.lista;
    const pesoPrio = p => PRIORIDADES.findIndex(x => x.id === p);
    const pesoEstado = e => ESTADOS.findIndex(x => x.id === e);
    const val = t => {
      switch (orden) {
        case 'asignado': return App.colaboradorDe(t)?.nombre || '~';
        case 'prioridad': return pesoPrio(t.prioridad);
        case 'estado': return pesoEstado(t.estado);
        case 'progreso': return UI.progreso(t).pct;
        case 'fecha_vencimiento': return t.fecha_vencimiento || '9999-99-99';
        default: return String(t[orden] || '~').toLowerCase();
      }
    };
    return [...lista].sort((a, b) => {
      const va = val(a), vb = val(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
    });
  },

  render() {
    const todas = this.ordenar(App.tareasVisibles());
    const { orden, dir, limite } = App.estado.lista;
    const filas = todas.slice(0, limite);
    const hoy = Util.hoyISO();

    const cab = this.COLUMNAS.map(([k, l]) => `<th><button class="th-orden ${orden === k ? 'on' : ''}" data-accion="ordenar" data-campo="${k}">${l}${orden === k ? (dir === 1 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');

    const cuerpo = filas.map(t => {
      const p = UI.progreso(t);
      const ef = Metricas.estadoEfectivo(t, hoy);
      const puede = Permisos.editarTarea(t);
      const c = App.colaboradorDe(t);
      return `<tr class="fila ${ef === 'vencida' ? 'fila-vencida' : ''} ${t.estado === 'completada' ? 'fila-hecha' : ''}">
        <td class="td-titulo">
          ${puede ? `<button class="check ${t.estado === 'completada' ? 'on' : ''}" data-accion="completar" data-id="${t.id}" aria-label="Completar">✓</button>` : ''}
          <button class="enlace-tarea" data-accion="abrir-tarea" data-id="${t.id}">${Util.esc(t.titulo)}</button>
          ${t.categoria ? `<span class="chip chip-suave">${Util.esc(t.categoria)}</span>` : ''}
        </td>
        <td><span class="celda-colab">${UI.avatar(t, 22)} ${Util.esc(c?.nombre || 'Sin asignar')}</span></td>
        <td class="muted">${Util.esc(t.empresa || '—')}</td>
        <td>${UI.prioridad(t.prioridad)}</td>
        <td>${puede
          ? `<select class="sel-estado est-${ef}" data-cambio="estado" data-id="${t.id}" aria-label="Estado">
              ${ESTADOS.map(e => `<option value="${e.id}" ${t.estado === e.id ? 'selected' : ''}>${e.icon} ${e.label}</option>`).join('')}
            </select>${ef === 'vencida' ? ' <span class="chip est-vencida" title="Fecha límite superada">⚠</span>' : ''}`
          : UI.estado(t)}</td>
        <td>${UI.fecha(t)}</td>
        <td><div class="barra-progreso" title="${p.texto}"><span style="width:${p.pct}%"></span></div><span class="muted mini">${p.texto}</span></td>
      </tr>`;
    }).join('');

    return `${UI.filtros()}
      <div class="barra-vista">
        <span class="muted">${todas.length} tareas${todas.length > filas.length ? ` · mostrando ${filas.length}` : ''}</span>
        <span class="separador"></span>
        <button class="btn btn-sm" data-accion="exportar">⬇ Exportar a Excel</button>
      </div>
      <div class="tarjeta-tabla">
        ${todas.length ? `<div class="tabla-scroll"><table class="tabla"><thead><tr>${cab}</tr></thead><tbody>${cuerpo}</tbody></table></div>` :
          UI.vacio('🔎', 'Sin tareas', 'No hay tareas con estos filtros.', '<button class="btn btn-primario" data-accion="nueva-tarea">＋ Nueva tarea</button>')}
        ${todas.length > filas.length ? `<div class="centrado pad"><button class="btn" data-accion="ver-mas">Ver ${Math.min(CONFIG.LIMITE_LISTA, todas.length - filas.length)} más</button></div>` : ''}
      </div>`;
  },

  acciones: {
    ordenar: el => {
      const s = App.estado.lista;
      if (s.orden === el.dataset.campo) s.dir *= -1; else { s.orden = el.dataset.campo; s.dir = 1; }
      App.render();
    },
    'ver-mas': () => { App.estado.lista.limite += CONFIG.LIMITE_LISTA; App.render(); },
    exportar: () => Importador.exportar(Vistas.lista.ordenar(App.tareasVisibles())),
  },

  alCambiar(el) {
    if (el.dataset.cambio === 'estado') {
      const label = ESTADOS.find(e => e.id === el.value)?.label;
      App.actualizar(el.dataset.id, { estado: el.value }, { mensaje: 'Estado: ' + label }).catch(() => {});
    }
  },
};
