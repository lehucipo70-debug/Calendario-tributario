// ═══════════════════════════════════════════════════════════════════
// VISTA: ADMINISTRACIÓN — importar/exportar y estado del sistema
// ═══════════════════════════════════════════════════════════════════

Vistas.admin = {
  titulo: 'Administración',
  icono: '⚙️',
  orden: 9,
  visible: () => Permisos.administrar(),

  render() {
    const demo = Datos.modo === 'demo';
    return `
      <div class="rejilla-2">
        <section class="panel">
          <header class="panel-cab"><h3>📥 Importar tareas desde Excel</h3></header>
          <p class="muted">Acepta dos formatos:</p>
          <ul class="lista-ayuda">
            <li><strong>Planner:</strong> columnas <code>TAREA</code> o <code>TITULO</code>, <code>COLABORADOR</code>, <code>FECHA</code>, y opcionales <code>EMPRESA</code>, <code>CATEGORIA</code>, <code>PRIORIDAD</code>, <code>ESTADO</code>, <code>DESCRIPCION</code>.</li>
            <li><strong>Calendario tributario anterior:</strong> <code>EMPRESA</code>, <code>CONTADOR</code>, <code>TIPO DE IMPUESTO</code>, <code>PERÍODO</code>, <code>FECHA VENCIMIENTO</code>. Cada obligación se convierte en una tarea de categoría Tributario.</li>
          </ul>
          <p class="muted mini">El colaborador se asocia por nombre con la tabla de perfiles. Reimportar el mismo archivo no duplica tareas.</p>
          <button class="btn btn-primario" data-accion="importar">Seleccionar archivo Excel</button>
          <input type="file" id="archivo-excel" accept=".xlsx,.xls,.csv" hidden>
        </section>

        <section class="panel">
          <header class="panel-cab"><h3>📤 Exportar</h3></header>
          <p class="muted">Descarga todas las tareas (${App.estado.tareas.length}) con su colaborador, estado y fechas.</p>
          <button class="btn" data-accion="exportar-todo">⬇ Descargar Excel</button>
        </section>

        <section class="panel">
          <header class="panel-cab"><h3>🔌 Estado del sistema</h3></header>
          <dl class="datos-sistema">
            <dt>Origen de datos</dt><dd>${demo ? '<span class="chip est-en_revision">Modo demo (navegador)</span>' : '<span class="chip est-completada">Supabase</span>'}</dd>
            <dt>Tiempo real</dt><dd>${App.estado.conectado ? 'Conectado' : 'Sin conexión'}</dd>
            <dt>Colaboradores</dt><dd>${App.estado.colaboradores.length}</dd>
            <dt>Tareas</dt><dd>${App.estado.tareas.length}</dd>
            <dt>Teams</dt><dd>${CONFIG.TEAMS_WEBHOOK_URL || Object.keys(CONFIG.TEAMS_WEBHOOKS_POR_COLABORADOR).length ? 'Configurado' : 'No configurado (js/config.js)'}</dd>
          </dl>
          <div class="fila-botones">
            <button class="btn" data-accion="sincronizar">🔄 Recargar datos</button>
            ${demo ? '<button class="btn" data-accion="reiniciar-demo">↺ Reiniciar datos demo</button>' : ''}
          </div>
        </section>

        <section class="panel">
          <header class="panel-cab"><h3>🔐 Permisos</h3></header>
          <p class="muted">La página oculta o muestra acciones según el rol del perfil (<code>${CONFIG.ROLES_ADMIN.join('</code>, <code>')}</code> = administrador; cualquier otro = colaborador).
          Quién puede leer, crear, editar o borrar cada tarea lo deciden las políticas RLS de Supabase.</p>
          <p class="muted mini">Opciones en <code>js/config.js</code>: colaboradores ven al equipo: <strong>${CONFIG.COLABORADORES_VEN_EQUIPO ? 'sí' : 'no'}</strong> ·
          asignan a otros: <strong>${CONFIG.COLABORADORES_ASIGNAN_A_OTROS ? 'sí' : 'no'}</strong>.</p>
        </section>
      </div>`;
  },

  montar(main) {
    main.querySelector('#archivo-excel')?.addEventListener('change', e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) Importador.importarArchivo(f);
    });
  },

  acciones: {
    importar: () => document.getElementById('archivo-excel').click(),
    'exportar-todo': () => Importador.exportar(App.estado.tareas),
    'reiniciar-demo': async () => {
      if (!confirm('¿Borrar los cambios del modo demo y volver a los datos de ejemplo?')) return;
      Datos.reiniciar();
      await App.sincronizar();
    },
  },
};
