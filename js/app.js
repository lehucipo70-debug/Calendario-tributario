// ═══════════════════════════════════════════════════════════════════
// APLICACIÓN — estado global, acciones sobre tareas, eventos y arranque
//
// Flujo: un evento del usuario → una acción de App → Datos (Supabase o
// demo) → App.render() vuelve a pintar la vista activa a partir del estado.
// ═══════════════════════════════════════════════════════════════════

const App = {
  estado: {
    perfil: null,
    colaboradores: [],
    tareas: [],
    conectado: false,
    errorCarga: null,
    vista: 'inicio',
    tema: 'claro',
    filtros: { alcance: 'mias', texto: '', colaborador: '', estado: '', prioridad: '', categoria: '' },
    tablero: { agrupar: 'estado' },
    lista: { orden: 'fecha_vencimiento', dir: 1, limite: CONFIG.LIMITE_LISTA },
    cal: { modo: 'mes', ref: Util.hoyISO() },
    rend: { periodo: 'mes' },
  },

  // ── Consultas sobre el estado ──────────────────────────────────────
  tarea(id) { return this.estado.tareas.find(t => t.id === id); },

  colaborador(id) { return this.estado.colaboradores.find(c => c.id === id) || null; },

  colaboradorDe(t) {
    if (t.asignado_a) return this.colaborador(t.asignado_a) || { id: t.asignado_a, nombre: t.asignado_nombre || 'Colaborador' };
    if (t.asignado_nombre) return { id: null, nombre: t.asignado_nombre };
    return null;
  },

  categorias() {
    return [...new Set([...CATEGORIAS, ...this.estado.tareas.map(t => t.categoria).filter(Boolean)])];
  },

  esMia(t) {
    const uid = Permisos.uid;
    return t.asignado_a === uid || (!t.asignado_a && t.creado_por === uid);
  },

  // Tareas que el usuario ve en tablero, lista y calendario.
  tareasVisibles({ sinFiltros = false } = {}) {
    const f = this.estado.filtros;
    let lista = this.estado.tareas;
    if (f.alcance === 'mias' || !Permisos.verEquipo()) lista = lista.filter(t => this.esMia(t));
    if (sinFiltros) return lista;
    const hoy = Util.hoyISO();
    const q = Util.normalizar(f.texto);
    return lista.filter(t =>
      (!f.colaborador || t.asignado_a === f.colaborador) &&
      (!f.estado || (f.estado === 'vencida' ? Metricas.estadoEfectivo(t, hoy) === 'vencida' : t.estado === f.estado)) &&
      (!f.prioridad || t.prioridad === f.prioridad) &&
      (!f.categoria || t.categoria === f.categoria) &&
      (!q || Util.normalizar(`${t.titulo} ${t.empresa || ''} ${t.descripcion || ''}`).includes(q)));
  },

  // ── Acciones sobre tareas ──────────────────────────────────────────
  async crear(datos) {
    const base = { estado: 'pendiente', prioridad: 'media', categoria: 'Otro', asignado_a: Permisos.uid, ...datos };
    if (base.estado === 'completada') base.progreso = 100;
    const t = await Datos.crearTarea(base);
    if (!this.tarea(t.id)) this.estado.tareas.push(t);
    this._registrar(t.id, 'creacion', 'Creó la tarea');
    if (t.asignado_a && t.asignado_a !== Permisos.uid) this._notificarAsignacion(t);
    this.render();
    UI.toast('Tarea creada', { tipo: 'ok' });
    return t;
  },

  // Calcula los campos que dependen de otros (progreso, fecha de completado).
  _derivar(t, cambios) {
    const c = { ...cambios };
    if ('checklist' in c && c.checklist.length) c.progreso = Util.pct(c.checklist.filter(i => i.hecho).length, c.checklist.length);
    if (c.estado === 'completada' && t.estado !== 'completada') c.progreso = 100;
    if (c.estado && c.estado !== 'completada' && t.estado === 'completada' && (c.progreso ?? t.progreso) === 100) c.progreso = 80;
    // completada_at lo fija la base de datos (trigger); aquí solo se refleja localmente.
    const local = {};
    if (c.estado && c.estado !== t.estado) local.completada_at = c.estado === 'completada' ? new Date().toISOString() : null;
    return { enviar: c, local };
  },

  async actualizar(id, cambios, { mensaje = null, deshacible = true } = {}) {
    const t = this.tarea(id);
    if (!t) return;
    if (!Permisos.editarTarea(t)) { UI.toast('No tienes permiso para modificar esta tarea.', { tipo: 'error' }); return; }
    const antes = structuredClone(t);
    const { enviar, local } = this._derivar(t, cambios);
    Object.assign(t, enviar, local);
    this.render();
    try {
      const guardada = await Datos.actualizarTarea(id, enviar);
      this._reemplazar(guardada);
      this._registrarCambios(antes, guardada);
      if (guardada.estado === 'completada' && antes.estado !== 'completada') this._notificarCompletada(guardada);
      if (guardada.asignado_a && guardada.asignado_a !== antes.asignado_a && guardada.asignado_a !== Permisos.uid) this._notificarAsignacion(guardada);
      this.render();
      if (mensaje) {
        const revertir = {};
        for (const k of Object.keys(enviar)) revertir[k] = antes[k];
        UI.toast(mensaje, { tipo: 'ok', deshacer: deshacible ? () => this.actualizar(id, revertir, { mensaje: 'Cambio revertido', deshacible: false }) : null });
      }
      return guardada;
    } catch (e) {
      this._reemplazar(antes);
      this.render();
      UI.toast(e.message, { tipo: 'error' });
      throw e;
    }
  },

  async eliminar(id) {
    const t = this.tarea(id);
    if (!t) return false;
    if (!Permisos.eliminarTarea(t)) { UI.toast('No tienes permiso para eliminar esta tarea.', { tipo: 'error' }); return false; }
    if (!confirm(`¿Eliminar la tarea "${t.titulo}"? Esta acción no se puede deshacer.`)) return false;
    try {
      await Datos.eliminarTarea(id);
      this.estado.tareas = this.estado.tareas.filter(x => x.id !== id);
      this.render();
      UI.toast('Tarea eliminada');
      return true;
    } catch (e) { UI.toast(e.message, { tipo: 'error' }); return false; }
  },

  completar(id) {
    const t = this.tarea(id);
    if (!t) return;
    const hecha = t.estado === 'completada';
    return this.actualizar(id, { estado: hecha ? 'en_progreso' : 'completada' }, { mensaje: hecha ? 'Tarea reabierta' : '✓ Tarea completada' }).catch(() => {});
  },

  // Arrastrar y soltar: campo = estado | asignado_a | prioridad | fecha_vencimiento
  mover(id, campo, valor) {
    const t = this.tarea(id);
    if (!t) return;
    valor = valor || null;
    if ((t[campo] || null) === valor) return;
    if (campo === 'asignado_a' && valor !== Permisos.uid && !Permisos.asignarAOtros()) {
      UI.toast('Solo un administrador puede asignar tareas a otros colaboradores.', { tipo: 'error' });
      return;
    }
    const textos = {
      estado: () => 'Movida a ' + (ESTADOS.find(e => e.id === valor)?.label || valor),
      asignado_a: () => 'Asignada a ' + (this.colaborador(valor)?.nombre || 'nadie'),
      prioridad: () => 'Prioridad: ' + (PRIORIDADES.find(p => p.id === valor)?.label || valor),
      fecha_vencimiento: () => 'Reprogramada para el ' + Util.fmtFecha(valor),
    };
    this.actualizar(id, { [campo]: valor }, { mensaje: textos[campo]?.() || 'Tarea actualizada' }).catch(() => {});
  },

  _reemplazar(t) {
    const i = this.estado.tareas.findIndex(x => x.id === t.id);
    if (i >= 0) this.estado.tareas[i] = t; else this.estado.tareas.push(t);
  },

  // ── Seguimiento (bitácora de cada tarea) ──────────────────────────
  _registrar(tareaId, tipo, texto) {
    Datos.registrarActividad(tareaId, tipo, texto).catch(e => console.warn('[seguimiento]', e.message));
  },

  _registrarCambios(antes, despues) {
    const nombreEstado = id => ESTADOS.find(e => e.id === id)?.label || id;
    if (antes.estado !== despues.estado) this._registrar(despues.id, 'estado', `Cambió el estado: ${nombreEstado(antes.estado)} → ${nombreEstado(despues.estado)}`);
    if ((antes.asignado_a || null) !== (despues.asignado_a || null)) this._registrar(despues.id, 'asignacion', `Asignó la tarea a ${this.colaborador(despues.asignado_a)?.nombre || 'nadie'}`);
    if ((antes.fecha_vencimiento || null) !== (despues.fecha_vencimiento || null)) this._registrar(despues.id, 'fecha', `Cambió la fecha límite: ${Util.fmtFecha(antes.fecha_vencimiento)} → ${Util.fmtFecha(despues.fecha_vencimiento)}`);
    if (antes.prioridad !== despues.prioridad) this._registrar(despues.id, 'edicion', `Cambió la prioridad a ${PRIORIDADES.find(p => p.id === despues.prioridad)?.label}`);
  },

  // ── Microsoft Teams ────────────────────────────────────────────────
  _notificarCompletada(t) {
    Teams.enviar('✅ Tarea completada', `**${t.titulo}**${t.empresa ? ' · ' + t.empresa : ''}\n\nCompletada por **${this.estado.perfil?.nombre}**`, this.colaboradorDe(t)?.nombre);
  },
  _notificarAsignacion(t) {
    const quien = this.colaborador(t.asignado_a)?.nombre || 'un colaborador';
    Teams.enviar('📌 Nueva tarea asignada', `**${t.titulo}** asignada a **${quien}**${t.fecha_vencimiento ? '\n\nVence: ' + Util.fmtFecha(t.fecha_vencimiento) : ''}`, quien);
  },

  // ── Navegación y render ────────────────────────────────────────────
  ir(vista) {
    if (!Vistas[vista] || !Vistas[vista].visible()) vista = 'inicio';
    if (location.hash !== '#/' + vista) history.replaceState(null, '', '#/' + vista);
    this.estado.vista = vista;
    window.scrollTo(0, 0);
    this.render();
  },

  _pendienteRender: false,
  render() {
    if (this._pendienteRender) return;
    this._pendienteRender = true;
    requestAnimationFrame(() => { this._pendienteRender = false; this._pintar(); });
  },

  _pintar() {
    if (!this.estado.perfil) return;
    const main = document.getElementById('main');
    // Conservar el foco del buscador entre repintados
    const activo = document.activeElement;
    const filtroActivo = activo?.dataset?.filtro;
    const cursor = filtroActivo ? activo.selectionStart : null;

    this._pintarNav();
    const v = Vistas[this.estado.vista];
    document.getElementById('titulo-vista').textContent = v.titulo;
    if (this.estado.errorCarga) {
      main.innerHTML = Vistas.inicio.errorCarga(this.estado.errorCarga);
    } else {
      main.innerHTML = v.render();
      v.montar?.(main);
    }

    if (filtroActivo) {
      const el = main.querySelector(`[data-filtro="${filtroActivo}"]`);
      if (el) { el.focus(); if (cursor !== null && el.setSelectionRange) el.setSelectionRange(cursor, cursor); }
    }
  },

  _pintarNav() {
    const hoy = Util.hoyISO();
    const misVencidas = this.estado.tareas.filter(t => this.esMia(t) && Metricas.estadoEfectivo(t, hoy) === 'vencida').length;
    const items = Object.entries(Vistas).filter(([, v]) => v.visible()).sort((a, b) => a[1].orden - b[1].orden);
    const html = items.map(([id, v]) => `<button class="${id === this.estado.vista ? 'activo' : ''}" data-accion="ir" data-vista="${id}" ${id === this.estado.vista ? 'aria-current="page"' : ''}>
        <span class="nav-icono">${v.icono}</span><span class="nav-texto">${v.titulo}</span>
        ${id === 'inicio' && misVencidas ? `<span class="nav-badge" title="Tus tareas vencidas">${misVencidas}</span>` : ''}
      </button>`).join('');
    document.getElementById('nav').innerHTML = html;
  },

  // ── Sesión ─────────────────────────────────────────────────────────
  async entrar(perfil) {
    this.estado.perfil = perfil;
    Permisos.usar(perfil);
    this.estado.filtros.alcance = Permisos.esAdmin() ? 'equipo' : 'mias';
    Login.ocultar();
    document.getElementById('app').hidden = false;
    this._pintarUsuario();
    document.getElementById('main').innerHTML = '<div class="cargando">Cargando tareas…</div>';
    await this.cargar();
    this._pintarUsuario(); // de nuevo: el color del avatar depende de la lista de colaboradores
    Datos.suscribir((evento, nueva, anterior, conectado) => this._alCambiar(evento, nueva, anterior, conectado));
    const desdeHash = location.hash.replace('#/', '');
    this.ir(Vistas[desdeHash] ? desdeHash : 'inicio');
  },

  async cargar() {
    try {
      const [colabs, tareas] = await Promise.all([
        Datos.colaboradores().catch(e => { if (e.faltaEsquema) throw e; console.warn(e.message); return []; }),
        Datos.tareas(),
      ]);
      // Si las políticas solo devuelven el propio perfil, igual debe aparecer el usuario actual.
      if (!colabs.some(c => c.id === this.estado.perfil.id)) colabs.push({ ...this.estado.perfil });
      colabs.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      this.estado.colaboradores = colabs;
      this.estado.tareas = tareas;
      this.estado.errorCarga = null;
    } catch (e) {
      console.error(e);
      this.estado.errorCarga = e;
    }
  },

  async sincronizar() {
    await this.cargar();
    this.render();
    if (!this.estado.errorCarga) UI.toast('Datos actualizados', { tipo: 'ok' });
  },

  async salir() {
    await Datos.logout();
    this.estado.perfil = null;
    this.estado.tareas = [];
    // El siguiente usuario empieza limpio: sin la vista ni los filtros del anterior.
    this.estado.vista = 'inicio';
    Object.assign(this.estado.filtros, { texto: '', colaborador: '', estado: '', prioridad: '', categoria: '' });
    this.estado.lista.limite = CONFIG.LIMITE_LISTA;
    history.replaceState(null, '', location.pathname + location.search);
    document.getElementById('app').hidden = true;
    UI.cerrarModal();
    Login.mostrar();
  },

  _alCambiar(evento, nueva, anterior, conectado) {
    if (evento === 'estado') {
      this.estado.conectado = conectado;
      const punto = document.getElementById('punto-conexion');
      if (punto) { punto.classList.toggle('off', !conectado); punto.title = conectado ? 'Conectado en tiempo real' : 'Sin conexión en tiempo real'; }
      return;
    }
    if (evento === 'recargar') { this.cargar().then(() => this.render()); return; }
    if (evento === 'DELETE' && anterior?.id) this.estado.tareas = this.estado.tareas.filter(t => t.id !== anterior.id);
    else if (nueva) this._reemplazar(nueva);
    this.render();
  },

  _pintarUsuario() {
    const p = this.estado.perfil;
    const rol = Permisos.esAdmin() ? 'Administrador' : 'Colaborador';
    document.getElementById('usuario').innerHTML = `
      ${UI.avatar(p, 30)}
      <div class="usuario-info"><strong>${Util.esc(p.nombre)}</strong><span>${rol}${Datos.modo === 'demo' ? ' · demo' : ''}</span></div>
      <span id="punto-conexion" class="punto-conexion off" title="Conectando…"></span>`;
  },

  aplicarTema(tema) {
    this.estado.tema = tema;
    document.documentElement.dataset.theme = tema === 'oscuro' ? 'dark' : 'light';
    try { localStorage.setItem('planner_tema', tema); } catch { /* sin almacenamiento */ }
    const b = document.getElementById('btn-tema');
    if (b) b.textContent = tema === 'oscuro' ? '☀️' : '🌙';
  },
};

// ═══════════════════════════════════════════════════════════════════
// EVENTOS (delegados: un solo listener por tipo para toda la página)
// ═══════════════════════════════════════════════════════════════════
const Acciones = {
  'ir': el => App.ir(el.dataset.vista),
  'nueva-tarea': el => TareaModal.abrirNueva({ fecha_vencimiento: el.dataset.fecha, estado: el.dataset.estado, asignado_a: el.dataset.asignado, prioridad: el.dataset.prioridad }),
  'abrir-tarea': el => TareaModal.abrir(el.dataset.id),
  'completar': el => App.completar(el.dataset.id),
  'alcance': el => { App.estado.filtros.alcance = el.dataset.valor; if (el.dataset.valor === 'mias') App.estado.filtros.colaborador = ''; App.render(); },
  'limpiar-filtros': () => { Object.assign(App.estado.filtros, { texto: '', colaborador: '', estado: '', prioridad: '', categoria: '' }); App.render(); },
  'ver-colaborador': el => {
    Object.assign(App.estado.filtros, { alcance: 'equipo', colaborador: el.dataset.id || '', estado: el.dataset.estado || '' });
    App.ir('lista');
  },
  'tema': () => App.aplicarTema(App.estado.tema === 'oscuro' ? 'claro' : 'oscuro'),
  'salir': () => App.salir(),
  'sincronizar': () => App.sincronizar(),
  'cerrar-modal': () => UI.cerrarModal(),
  'menu': () => document.body.classList.toggle('menu-abierto'),
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-accion]');
  if (!el) {
    if (e.target.id === 'modal') UI.cerrarModal();
    return;
  }
  const fn = Acciones[el.dataset.accion] || Vistas[App.estado.vista]?.acciones?.[el.dataset.accion] || TareaModal.acciones[el.dataset.accion];
  if (!fn) return;
  e.preventDefault();
  e.stopPropagation();
  if (el.dataset.accion === 'ir') document.body.classList.remove('menu-abierto');
  fn(el, e);
});

document.addEventListener('input', e => {
  const campo = e.target.dataset?.filtro;
  if (campo === 'texto') { App.estado.filtros.texto = e.target.value; App.render(); }
});
document.addEventListener('change', e => {
  const campo = e.target.dataset?.filtro;
  if (campo && campo !== 'texto') { App.estado.filtros[campo] = e.target.value; App.render(); return; }
  const fn = Vistas[App.estado.vista]?.alCambiar;
  if (e.target.dataset?.cambio && fn) fn(e.target);
});

// Tooltips de gráficas: cualquier elemento con data-tip
document.addEventListener('mouseover', e => {
  const el = e.target.closest?.('[data-tip]');
  const tip = document.getElementById('tooltip');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
});
document.addEventListener('mousemove', e => {
  const tip = document.getElementById('tooltip');
  if (tip.hidden) return;
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
  const y = e.clientY + 18 + tip.offsetHeight > innerHeight ? e.clientY - tip.offsetHeight - 10 : e.clientY + 18;
  tip.style.transform = `translate(${x}px, ${y}px)`;
});

// Arrastrar y soltar
document.addEventListener('dragstart', e => {
  const el = e.target.closest?.('[data-arrastrar]');
  if (!el) return;
  e.dataTransfer.setData('text/plain', el.dataset.arrastrar);
  e.dataTransfer.effectAllowed = 'move';
  requestAnimationFrame(() => el.classList.add('arrastrando'));
});
document.addEventListener('dragend', () => {
  document.querySelectorAll('.arrastrando, .sobre').forEach(x => x.classList.remove('arrastrando', 'sobre'));
});
document.addEventListener('dragover', e => {
  const zona = e.target.closest?.('[data-soltar]');
  if (!zona) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.sobre').forEach(x => x !== zona && x.classList.remove('sobre'));
  zona.classList.add('sobre');
});
document.addEventListener('drop', e => {
  const zona = e.target.closest?.('[data-soltar]');
  if (!zona) return;
  e.preventDefault();
  zona.classList.remove('sobre');
  const id = e.dataTransfer.getData('text/plain');
  if (id) App.mover(id, zona.dataset.soltar, zona.dataset.valor);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { UI.cerrarModal(); document.body.classList.remove('menu-abierto'); return; }
  const escribiendo = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (!escribiendo && App.estado.perfil && document.getElementById('modal').hidden && e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    TareaModal.abrirNueva();
  }
});

window.addEventListener('hashchange', () => {
  const v = location.hash.replace('#/', '');
  if (App.estado.perfil && v !== App.estado.vista && Vistas[v]) App.ir(v);
});

// ═══════════════════════════════════════════════════════════════════
// ARRANQUE
// ═══════════════════════════════════════════════════════════════════
(async () => {
  let tema = 'claro';
  try { tema = localStorage.getItem('planner_tema') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'); } catch { /* sin almacenamiento */ }
  App.aplicarTema(tema);
  try {
    await Datos.iniciar();
    const perfil = await Datos.sesion();
    if (perfil) { await App.entrar(perfil); return; }
  } catch (e) {
    console.error(e);
    Login.error(e.message);
  }
  Login.mostrar();
})();
