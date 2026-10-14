// ═══════════════════════════════════════════════════════════════════
// VISTA: TABLERO (kanban). Arrastrar una tarjeta a otra columna cambia
// el campo por el que se agrupa: estado, colaborador o prioridad.
// ═══════════════════════════════════════════════════════════════════

Vistas.tablero = {
  titulo: 'Tablero',
  icono: '🗂️',
  orden: 2,
  visible: () => true,

  columnas() {
    const agrupar = App.estado.tablero.agrupar;
    if (agrupar === 'prioridad') return { campo: 'prioridad', cols: PRIORIDADES.map(p => ({ valor: p.id, titulo: `${p.icon} ${p.label}`, cls: 'prio-' + p.id })) };
    if (agrupar === 'colaborador') {
      const visibles = App.estado.filtros.alcance === 'mias' ? [App.estado.perfil] : App.estado.colaboradores;
      return {
        campo: 'asignado_a',
        cols: [...visibles.map(c => ({ valor: c.id, titulo: Util.esc(c.nombre), avatar: c })), { valor: '', titulo: 'Sin asignar' }],
      };
    }
    return { campo: 'estado', cols: ESTADOS.map(e => ({ valor: e.id, titulo: `${e.icon} ${e.label}`, cls: 'est-' + e.id })) };
  },

  render() {
    const { campo, cols } = this.columnas();
    const tareas = App.tareasVisibles();
    const orden = (a, b) => (a.fecha_vencimiento || '9999').localeCompare(b.fecha_vencimiento || '9999')
      || PRIORIDADES.findIndex(p => p.id === a.prioridad) - PRIORIDADES.findIndex(p => p.id === b.prioridad);
    const ag = App.estado.tablero.agrupar;
    const datoNueva = campo === 'estado' ? 'data-estado' : campo === 'prioridad' ? 'data-prioridad' : 'data-asignado';

    const columnas = cols.map(col => {
      const lista = tareas.filter(t => (t[campo] || '') === col.valor).sort(orden);
      // Si las tareas completadas son muchas, se muestran las más recientes.
      const recortar = campo === 'estado' && col.valor === 'completada' && lista.length > 30;
      const mostradas = recortar ? lista.slice(-30).reverse() : lista;
      return `<section class="columna ${col.cls || ''}" data-soltar="${campo}" data-valor="${col.valor}" aria-label="${Util.esc(col.titulo.replace(/<[^>]+>/g, ''))}">
        <header class="columna-cab">
          ${col.avatar ? UI.avatar(col.avatar, 22) : ''}
          <h3>${col.titulo}</h3><span class="contador">${lista.length}</span>
          <button class="btn-icono btn-sm" data-accion="nueva-tarea" ${datoNueva}="${col.valor}" title="Agregar tarea aquí" aria-label="Agregar tarea">＋</button>
        </header>
        <div class="columna-cuerpo">
          ${mostradas.map(t => UI.tarjeta(t)).join('') || '<p class="columna-vacia">Suelta tareas aquí</p>'}
          ${recortar ? `<p class="muted pad centrado">Mostrando las 30 más recientes de ${lista.length}</p>` : ''}
        </div>
      </section>`;
    }).join('');

    return `${UI.filtros()}
      <div class="barra-vista">
        <div class="segmentado" role="group" aria-label="Agrupar por">
          <span class="seg-etiqueta">Agrupar por</span>
          ${[['estado', 'Estado'], ['colaborador', 'Colaborador'], ['prioridad', 'Prioridad']].map(([v, l]) =>
            `<button class="${ag === v ? 'on' : ''}" data-accion="agrupar" data-valor="${v}">${l}</button>`).join('')}
        </div>
        <span class="muted">${tareas.length} tareas · arrastra las tarjetas entre columnas</span>
      </div>
      <div class="tablero">${columnas}</div>`;
  },

  acciones: {
    agrupar: el => { App.estado.tablero.agrupar = el.dataset.valor; App.render(); },
  },
};
