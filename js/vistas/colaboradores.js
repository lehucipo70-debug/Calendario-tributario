// ═══════════════════════════════════════════════════════════════════
// VISTA: COLABORADORES — carga de trabajo actual de cada persona
// ═══════════════════════════════════════════════════════════════════

Vistas.colaboradores = {
  titulo: 'Colaboradores',
  icono: '👥',
  orden: 6,
  visible: () => Permisos.verEquipo(),

  render() {
    const hoy = Util.hoyISO();
    const filasMes = new Map(Metricas.porColaborador(App.estado.tareas, App.estado.colaboradores, { periodo: 'mes', hoy }).map(f => [f.clave, f]));
    const abiertasDe = id => App.estado.tareas.filter(t => t.asignado_a === id && t.estado !== 'completada');
    const maxCarga = Math.max(1, ...App.estado.colaboradores.map(c => abiertasDe(c.id).length));

    const tarjetas = App.estado.colaboradores.map(c => {
      const abiertas = abiertasDe(c.id);
      const vencidas = abiertas.filter(t => t.fecha_vencimiento && t.fecha_vencimiento < hoy).length;
      const pronto = abiertas.filter(t => Metricas.porVencer(t, hoy)).length;
      const enProgreso = abiertas.filter(t => t.estado === 'en_progreso' || t.estado === 'en_revision').length;
      const f = filasMes.get(c.id);
      const siguiente = abiertas.filter(t => t.fecha_vencimiento).sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))[0];
      const esAdmin = CONFIG.ROLES_ADMIN.includes(c.rol);
      return `<article class="colab">
        <header class="colab-cab">
          ${UI.avatar(c, 44)}
          <div class="colab-nombre"><h3>${Util.esc(c.nombre)}</h3><span class="muted mini">${esAdmin ? 'Administrador' : 'Colaborador'}${c.correo ? ' · ' + Util.esc(c.correo) : ''}</span></div>
          ${UI.nivel(f?.indice)}
        </header>
        <div class="colab-stats">
          <div><strong>${abiertas.length}</strong><span>Abiertas</span></div>
          <div><strong>${enProgreso}</strong><span>En curso</span></div>
          <div class="${pronto ? 'txt-ambar' : ''}"><strong>${pronto}</strong><span>Por vencer</span></div>
          <div class="${vencidas ? 'txt-rojo' : ''}"><strong>${vencidas}</strong><span>Vencidas</span></div>
        </div>
        <div class="carga" title="Carga de trabajo relativa al equipo"><span style="width:${Util.pct(abiertas.length, maxCarga)}%;background:${UI.colorColaborador(c.id)}"></span></div>
        <p class="mini muted">${siguiente ? `Próxima: <strong>${Util.esc(siguiente.titulo)}</strong> · ${Util.fmtRelativa(siguiente.fecha_vencimiento)}` : 'Sin entregas pendientes'}</p>
        <footer class="colab-pie">
          <button class="btn btn-sm" data-accion="ver-colaborador" data-id="${c.id}">Ver tareas</button>
          ${Permisos.asignarAOtros() || c.id === Permisos.uid ? `<button class="btn btn-sm btn-primario" data-accion="nueva-tarea" data-asignado="${c.id}">＋ Asignar tarea</button>` : ''}
        </footer>
      </article>`;
    }).join('');

    return `<div class="barra-vista"><span class="muted">${App.estado.colaboradores.length} colaboradores · índice del mes en curso</span>
        ${Permisos.administrar() ? '<span class="muted mini">Los colaboradores se gestionan en la tabla <code>perfiles</code> de Supabase.</span>' : ''}</div>
      <div class="rejilla-colabs">${tarjetas}</div>`;
  },
};
