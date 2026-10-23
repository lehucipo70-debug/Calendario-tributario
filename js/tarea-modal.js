// ═══════════════════════════════════════════════════════════════════
// VENTANA DE TAREA — crear, editar, lista de verificación y seguimiento
// ═══════════════════════════════════════════════════════════════════

const TareaModal = {
  id: null,          // null = tarea nueva
  original: null,
  checklist: [],

  abrirNueva(pre = {}) {
    if (!Permisos.crearTarea()) return;
    const limpio = Object.fromEntries(Object.entries(pre).filter(([, v]) => v !== undefined));
    const asignado = 'asignado_a' in limpio ? (limpio.asignado_a || null) : Permisos.uid;
    this._abrir(null, {
      titulo: '', descripcion: '', empresa: '', categoria: 'Otro', prioridad: 'media', estado: 'pendiente',
      fecha_inicio: null, fecha_vencimiento: null, progreso: 0, checklist: [], ...limpio,
      asignado_a: asignado && (asignado === Permisos.uid || Permisos.asignarAOtros()) ? asignado : Permisos.uid,
    });
  },

  abrir(id) {
    const t = App.tarea(id);
    if (t) this._abrir(id, structuredClone(t));
  },

  _abrir(id, t) {
    this.id = id;
    this.original = t;
    this.checklist = structuredClone(t.checklist || []);
    const editable = !id || Permisos.editarTarea(t);
    const dis = editable ? '' : 'disabled';
    const opcionesColab = App.estado.colaboradores
      .filter(c => Permisos.asignarAOtros() || c.id === Permisos.uid || c.id === t.asignado_a)
      .map(c => `<option value="${c.id}" ${c.id === t.asignado_a ? 'selected' : ''}>${Util.esc(c.nombre)}</option>`).join('');
    const creador = id && t.creado_por ? App.colaborador(t.creado_por)?.nombre : null;

    UI.abrirModal(`
      <form id="form-tarea" class="form-tarea" novalidate>
        <header class="modal-cab">
          <input name="titulo" class="input-titulo" placeholder="Nombre de la tarea" value="${Util.esc(t.titulo)}" maxlength="300" required ${dis} ${!id ? 'autofocus' : ''} aria-label="Título">
          <button type="button" class="btn-icono" data-accion="cerrar-modal" aria-label="Cerrar">✕</button>
        </header>
        ${id ? `<p class="muted mini meta-tarea">${UI.estado(t)} ${creador ? `· Creada por ${Util.esc(creador)}` : ''} ${t.created_at ? '· ' + Util.fmtFechaHora(t.created_at) : ''}
          ${t.completada_at ? '· Completada ' + Util.fmtFechaHora(t.completada_at) : ''}</p>` : ''}
        <div class="tarea-grid ${id ? '' : 'sin-seguimiento'}">
          <div class="tarea-principal">
            <div class="campos">
              <label>Colaborador
                <select name="asignado_a" ${dis} ${Permisos.asignarAOtros() ? '' : 'title="Solo un administrador puede asignar a otros"'}>
                  ${Permisos.asignarAOtros() ? `<option value="" ${!t.asignado_a ? 'selected' : ''}>Sin asignar</option>` : ''}${opcionesColab}
                </select></label>
              <label>Estado
                <select name="estado" ${dis}>${ESTADOS.map(e => `<option value="${e.id}" ${t.estado === e.id ? 'selected' : ''}>${e.icon} ${e.label}</option>`).join('')}</select></label>
              <label>Prioridad
                <select name="prioridad" ${dis}>${PRIORIDADES.map(p => `<option value="${p.id}" ${t.prioridad === p.id ? 'selected' : ''}>${p.icon} ${p.label}</option>`).join('')}</select></label>
              <label>Categoría
                <input name="categoria" list="lista-categorias" value="${Util.esc(t.categoria || '')}" ${dis} maxlength="60">
                <datalist id="lista-categorias">${App.categorias().map(c => `<option value="${Util.esc(c)}">`).join('')}</datalist></label>
              <label>Fecha de inicio<input type="date" name="fecha_inicio" value="${t.fecha_inicio || ''}" ${dis}></label>
              <label>Fecha límite<input type="date" name="fecha_vencimiento" value="${t.fecha_vencimiento || ''}" ${dis}></label>
              <label class="campo-ancho">Empresa / cliente
                <input name="empresa" list="lista-empresas" value="${Util.esc(t.empresa || '')}" ${dis} maxlength="200" placeholder="Opcional">
                <datalist id="lista-empresas">${[...new Set(App.estado.tareas.map(x => x.empresa).filter(Boolean))].sort().slice(0, 300).map(e => `<option value="${Util.esc(e)}">`).join('')}</datalist></label>
            </div>
            <label class="campo-ancho">Descripción
              <textarea name="descripcion" rows="3" maxlength="10000" ${dis} placeholder="Detalles, instrucciones, enlaces…">${Util.esc(t.descripcion || '')}</textarea></label>

            <div class="bloque">
              <div class="bloque-cab"><strong>Lista de verificación</strong><span class="muted mini" id="check-resumen"></span></div>
              <ul class="checklist" id="checklist"></ul>
              ${editable ? `<div class="check-nuevo"><input id="check-input" placeholder="＋ Agregar paso y presionar Enter" maxlength="200" aria-label="Nuevo paso"><button type="button" class="btn btn-sm" data-accion="check-agregar">Agregar</button></div>` : ''}
            </div>
            <div class="bloque" id="bloque-progreso">
              <label>Progreso manual: <strong id="progreso-valor">${t.progreso || 0}%</strong>
                <input type="range" name="progreso" min="0" max="100" step="10" value="${t.progreso || 0}" ${dis}></label>
            </div>
          </div>
          ${id ? `<aside class="tarea-seguimiento">
            <strong>Seguimiento</strong>
            <ol class="timeline" id="timeline"><li class="muted">Cargando…</li></ol>
            <div class="comentar">
              <textarea id="comentario" rows="2" placeholder="Escribe una actualización o comentario…" maxlength="2000" aria-label="Comentario"></textarea>
              <button type="button" class="btn btn-sm btn-primario" data-accion="comentar">Comentar</button>
            </div>
          </aside>` : ''}
        </div>
        <footer class="modal-pie">
          ${id && Permisos.eliminarTarea(t) ? '<button type="button" class="btn btn-peligro" data-accion="eliminar-tarea">🗑 Eliminar</button>' : ''}
          <span class="separador"></span>
          <button type="button" class="btn" data-accion="cerrar-modal">${editable ? 'Cancelar' : 'Cerrar'}</button>
          ${editable ? `<button type="submit" class="btn btn-primario" id="btn-guardar">${id ? 'Guardar cambios' : 'Crear tarea'}</button>` : ''}
        </footer>
      </form>`, { ancho: id ? 900 : 640 });

    this._editable = editable;
    this._pintarChecklist();
    const form = document.getElementById('form-tarea');
    form.addEventListener('submit', e => { e.preventDefault(); this.guardar(); });
    form.progreso?.addEventListener('input', e => { document.getElementById('progreso-valor').textContent = e.target.value + '%'; });
    document.getElementById('check-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); this.acciones['check-agregar'](); }
    });
    form.addEventListener('change', e => {
      if (e.target.dataset.check) {
        const item = this.checklist.find(i => i.id === e.target.dataset.check);
        if (item) { item.hecho = e.target.checked; this._pintarChecklist(); }
      }
    });
    if (id) this._cargarSeguimiento();
  },

  _pintarChecklist() {
    const ul = document.getElementById('checklist');
    if (!ul) return;
    const dis = this._editable ? '' : 'disabled';
    ul.innerHTML = this.checklist.map(i => `<li class="${i.hecho ? 'hecho' : ''}">
        <label><input type="checkbox" data-check="${Util.esc(i.id)}" ${i.hecho ? 'checked' : ''} ${dis}> <span>${Util.esc(i.texto)}</span></label>
        ${this._editable ? `<button type="button" class="btn-icono btn-sm" data-accion="check-quitar" data-item="${Util.esc(i.id)}" aria-label="Quitar paso">✕</button>` : ''}
      </li>`).join('') || '<li class="muted mini">Sin pasos. Divide la tarea en pasos para medir el avance automáticamente.</li>';
    const hechos = this.checklist.filter(i => i.hecho).length;
    document.getElementById('check-resumen').textContent = this.checklist.length ? `${hechos}/${this.checklist.length} · ${Util.pct(hechos, this.checklist.length)}%` : '';
    // Con pasos, el progreso se calcula solo; sin pasos se ajusta a mano.
    document.getElementById('bloque-progreso').hidden = this.checklist.length > 0;
  },

  async _cargarSeguimiento() {
    const ol = document.getElementById('timeline');
    const id = this.id;
    try {
      const items = await Datos.actividad(id);
      if (this.id !== id || !document.getElementById('timeline')) return;
      ol.innerHTML = items.length ? items.map(a => `<li class="tl-tipo-${a.tipo}">
          <div class="tl-cab"><strong>${Util.esc(a.autor_nombre || 'Sistema')}</strong><span class="muted mini">${Util.fmtFechaHora(a.created_at)}</span></div>
          <div class="${a.tipo === 'comentario' ? 'tl-comentario' : 'muted mini'}">${Util.esc(a.texto)}</div>
        </li>`).join('') : '<li class="muted mini">Aún no hay actividad.</li>';
      ol.scrollTop = ol.scrollHeight;
    } catch (e) {
      ol.innerHTML = `<li class="muted mini">${Util.esc(e.message)}</li>`;
    }
  },

  _leerFormulario() {
    const f = document.getElementById('form-tarea');
    const v = n => (f[n]?.value ?? '').trim();
    const datos = {
      titulo: v('titulo'),
      descripcion: v('descripcion') || null,
      asignado_a: v('asignado_a') || null,
      estado: v('estado'),
      prioridad: v('prioridad'),
      categoria: v('categoria') || 'Otro',
      empresa: v('empresa') || null,
      fecha_inicio: v('fecha_inicio') || null,
      fecha_vencimiento: v('fecha_vencimiento') || null,
      checklist: this.checklist,
    };
    if (!this.checklist.length) datos.progreso = Number(v('progreso')) || 0;
    return datos;
  },

  async guardar() {
    const datos = this._leerFormulario();
    if (!datos.titulo) { UI.toast('Escribe el nombre de la tarea.', { tipo: 'error' }); document.querySelector('#form-tarea [name=titulo]').focus(); return; }
    if (datos.fecha_inicio && datos.fecha_vencimiento && datos.fecha_inicio > datos.fecha_vencimiento) {
      UI.toast('La fecha de inicio no puede ser posterior a la fecha límite.', { tipo: 'error' }); return;
    }
    const btn = document.getElementById('btn-guardar');
    btn.disabled = true;
    try {
      if (!this.id) {
        await App.crear(datos);
      } else {
        // Solo se envían los campos que cambiaron
        const cambios = {};
        const norm = x => JSON.stringify(x === '' || x === undefined ? null : x);
        for (const [k, val] of Object.entries(datos)) {
          if (norm(val) !== norm(this.original[k])) cambios[k] = val;
        }
        if (Object.keys(cambios).length) await App.actualizar(this.id, cambios, { mensaje: 'Tarea guardada', deshacible: false });
      }
      UI.cerrarModal();
    } catch (e) {
      if (!this.id) UI.toast(e.message, { tipo: 'error' });
      if (btn.isConnected) btn.disabled = false;
    }
  },

  acciones: {
    'check-agregar': () => {
      const input = document.getElementById('check-input');
      const texto = input?.value.trim();
      if (!texto) return;
      if (TareaModal.checklist.length >= 100) { UI.toast('Máximo 100 pasos por tarea.', { tipo: 'error' }); return; }
      TareaModal.checklist.push({ id: Util.uid(), texto, hecho: false });
      input.value = '';
      TareaModal._pintarChecklist();
      input.focus();
    },
    'check-quitar': el => {
      TareaModal.checklist = TareaModal.checklist.filter(i => i.id !== el.dataset.item);
      TareaModal._pintarChecklist();
    },
    'eliminar-tarea': async () => {
      if (await App.eliminar(TareaModal.id)) UI.cerrarModal();
    },
    comentar: async el => {
      const ta = document.getElementById('comentario');
      const texto = ta.value.trim();
      if (!texto) return;
      el.disabled = true;
      try {
        await Datos.registrarActividad(TareaModal.id, 'comentario', texto);
        ta.value = '';
        await TareaModal._cargarSeguimiento();
      } catch (e) { UI.toast(e.message, { tipo: 'error' }); }
      el.disabled = false;
    },
  },
};
