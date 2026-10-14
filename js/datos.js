// ═══════════════════════════════════════════════════════════════════
// CAPA DE DATOS
//
// Dos implementaciones con la misma interfaz:
//   · SupabaseStore — producción (tablas: tareas, tarea_actividad, perfiles)
//   · LocalStore    — modo demo, guarda en el navegador
// El resto de la app solo usa `Datos`, nunca Supabase directamente.
//
// Interfaz:
//   iniciar() · login(email, pass) · sesion() · logout() · recuperar(email)
//   colaboradores() · tareas() · crearTarea(t) · actualizarTarea(id, cambios)
//   eliminarTarea(id) · actividad(tareaId) · registrarActividad(tareaId, tipo, texto)
//   importarTareas(lista) · suscribir(cb)
// ═══════════════════════════════════════════════════════════════════

class ErrorDatos extends Error {
  constructor(mensaje, { codigo, original, faltaEsquema = false } = {}) {
    super(mensaje);
    this.codigo = codigo;
    this.original = original;
    this.faltaEsquema = faltaEsquema;
  }
}

const CAMPOS_TAREA = ['titulo', 'descripcion', 'asignado_a', 'asignado_nombre', 'empresa', 'categoria', 'prioridad', 'estado',
  'fecha_inicio', 'fecha_vencimiento', 'progreso', 'checklist', 'etiquetas', 'completada_at', 'origen_ref'];

function normalizarTarea(t) {
  return {
    ...t,
    titulo: t.titulo || '(sin título)',
    estado: t.estado || 'pendiente',
    prioridad: t.prioridad || 'media',
    progreso: Number(t.progreso) || 0,
    checklist: Array.isArray(t.checklist) ? t.checklist : [],
    etiquetas: Array.isArray(t.etiquetas) ? t.etiquetas : [],
  };
}

// Solo columnas conocidas; evita mandar campos internos a la base de datos.
function limpiarParaGuardar(obj) {
  const out = {};
  for (const k of CAMPOS_TAREA) if (k in obj) out[k] = obj[k] === '' ? null : obj[k];
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────────────
class SupabaseStore {
  constructor() { this.sb = null; this.canal = null; this.usuario = null; this.perfil = null; }

  get modo() { return 'supabase'; }

  async iniciar() {
    if (!window.supabase?.createClient) throw new ErrorDatos('No se pudo cargar la librería de Supabase. Revisa tu conexión a internet.');
    this.sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: true, persistSession: true },
    });
  }

  _error(error, accion) {
    const msg = error?.message || String(error);
    const faltaEsquema = error?.code === '42P01' || error?.code === 'PGRST205' || /does not exist|could not find the table/i.test(msg);
    if (faltaEsquema) return new ErrorDatos('Falta crear las tablas del planner en Supabase (ejecuta supabase/schema.sql).', { codigo: error.code, original: error, faltaEsquema });
    if (error?.code === 'PGRST116' || error?.code === '42501' || /row-level security|permission denied/i.test(msg)) {
      return new ErrorDatos('No tienes permiso para ' + accion + '.', { codigo: error.code, original: error });
    }
    return new ErrorDatos('Error al ' + accion + ': ' + msg, { codigo: error?.code, original: error });
  }

  async _cargarPerfil(user) {
    const { data } = await this.sb.from(CONFIG.TABLAS.perfiles).select('*').eq('id', user.id).maybeSingle();
    this.usuario = user;
    this.perfil = {
      id: user.id,
      nombre: data?.nombre || user.email.split('@')[0],
      correo: data?.correo || user.email,
      rol: (data?.rol || 'colaborador').toLowerCase(),
    };
    return this.perfil;
  }

  async login(email, pass) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password: pass });
    if (error) throw new ErrorDatos(/invalid/i.test(error.message) ? 'Correo o contraseña incorrectos.' : error.message);
    return this._cargarPerfil(data.user);
  }

  async sesion() {
    const { data } = await this.sb.auth.getSession();
    return data?.session?.user ? this._cargarPerfil(data.session.user) : null;
  }

  async logout() {
    if (this.canal) { this.sb.removeChannel(this.canal); this.canal = null; }
    await this.sb.auth.signOut();
    this.usuario = this.perfil = null;
  }

  async recuperar(email) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
    if (error) throw new ErrorDatos('No se pudo enviar el enlace: ' + error.message);
  }

  async colaboradores() {
    const { data, error } = await this.sb.from(CONFIG.TABLAS.perfiles).select('*').order('nombre');
    if (error) throw this._error(error, 'leer los colaboradores');
    return (data || [])
      .filter(p => p.activo !== false)
      .map(p => ({ id: p.id, nombre: p.nombre || p.correo || 'Sin nombre', correo: p.correo || '', rol: (p.rol || 'colaborador').toLowerCase() }));
  }

  async tareas() {
    // PostgREST devuelve como máximo 1000 filas por consulta: se pagina.
    const todas = [];
    const PAGINA = 1000;
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await this.sb.from(CONFIG.TABLAS.tareas).select('*')
        .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
        .order('id')
        .range(desde, desde + PAGINA - 1);
      if (error) throw this._error(error, 'leer las tareas');
      todas.push(...data);
      if (data.length < PAGINA) break;
    }
    return todas.map(normalizarTarea);
  }

  async crearTarea(t) {
    const fila = { ...limpiarParaGuardar(t), creado_por: this.usuario?.id };
    const { data, error } = await this.sb.from(CONFIG.TABLAS.tareas).insert(fila).select().single();
    if (error) throw this._error(error, 'crear la tarea');
    return normalizarTarea(data);
  }

  async actualizarTarea(id, cambios) {
    const { data, error } = await this.sb.from(CONFIG.TABLAS.tareas).update(limpiarParaGuardar(cambios)).eq('id', id).select().single();
    if (error) throw this._error(error, 'modificar esta tarea');
    return normalizarTarea(data);
  }

  async eliminarTarea(id) {
    const { data, error } = await this.sb.from(CONFIG.TABLAS.tareas).delete().eq('id', id).select('id');
    if (error) throw this._error(error, 'eliminar esta tarea');
    if (!data?.length) throw new ErrorDatos('No tienes permiso para eliminar esta tarea.');
  }

  async actividad(tareaId) {
    const { data, error } = await this.sb.from(CONFIG.TABLAS.actividad).select('*').eq('tarea_id', tareaId).order('created_at');
    if (error) throw this._error(error, 'leer el seguimiento');
    return data || [];
  }

  async registrarActividad(tareaId, tipo, texto) {
    const fila = { tarea_id: tareaId, tipo, texto, autor_id: this.usuario?.id, autor_nombre: this.perfil?.nombre };
    const { data, error } = await this.sb.from(CONFIG.TABLAS.actividad).insert(fila).select().single();
    if (error) throw this._error(error, 'guardar el seguimiento');
    return data;
  }

  async importarTareas(lista, alAvanzar) {
    let hechas = 0;
    const filas = lista.map(t => ({ ...limpiarParaGuardar(t), creado_por: this.usuario?.id }));
    for (let i = 0; i < filas.length; i += 500) {
      const lote = filas.slice(i, i + 500);
      // origen_ref evita duplicados al reimportar el mismo archivo
      const { error } = await this.sb.from(CONFIG.TABLAS.tareas).upsert(lote, { onConflict: 'origen_ref', ignoreDuplicates: true });
      if (error) throw this._error(error, 'importar tareas');
      hechas += lote.length;
      alAvanzar?.(hechas, filas.length);
    }
    return hechas;
  }

  // cb(evento, tareaNueva, tareaAnterior, estadoConexion)
  suscribir(cb) {
    if (this.canal) this.sb.removeChannel(this.canal);
    this.canal = this.sb.channel('tareas-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: CONFIG.TABLAS.tareas }, p => {
        cb(p.eventType, p.new && Object.keys(p.new).length ? normalizarTarea(p.new) : null, p.old || null);
      })
      .subscribe(estado => cb('estado', null, null, estado === 'SUBSCRIBED'));
  }
}

// ─────────────────────────────────────────────────────────────────────
// LOCAL (modo demo)
// ─────────────────────────────────────────────────────────────────────
class LocalStore {
  constructor() { this.CLAVE = 'planner_demo_v1'; this.db = null; this.perfil = null; }

  get modo() { return 'demo'; }

  async iniciar() {
    try { this.db = JSON.parse(localStorage.getItem(this.CLAVE) || 'null'); } catch { this.db = null; }
    if (!this.db?.colaboradores) { this.db = DatosDemo.generar(); this._guardar(); }
  }

  _guardar() { try { localStorage.setItem(this.CLAVE, JSON.stringify(this.db)); } catch { /* almacenamiento lleno o bloqueado */ } }

  reiniciar() { this.db = DatosDemo.generar(); this._guardar(); }

  async login(email) {
    const correo = String(email).trim().toLowerCase();
    const c = this.db.colaboradores.find(x => x.correo === correo) || this.db.colaboradores.find(x => x.rol === 'admin');
    this.perfil = { ...c };
    sessionStorage.setItem('planner_demo_sesion', c.id);
    return this.perfil;
  }

  async sesion() {
    const id = sessionStorage.getItem('planner_demo_sesion');
    const c = id && this.db.colaboradores.find(x => x.id === id);
    return c ? (this.perfil = { ...c }) : null;
  }

  async logout() { sessionStorage.removeItem('planner_demo_sesion'); this.perfil = null; }
  async recuperar() { /* en demo no hay correos */ }

  async colaboradores() { return this.db.colaboradores.map(c => ({ ...c })); }
  async tareas() { return this.db.tareas.map(t => normalizarTarea(structuredClone(t))); }

  async crearTarea(t) {
    const ahora = new Date().toISOString();
    const nueva = normalizarTarea({
      estado: 'pendiente', prioridad: 'media', progreso: 0, checklist: [], etiquetas: [],
      ...limpiarParaGuardar(t), id: Util.uid(), creado_por: this.perfil?.id, created_at: ahora, updated_at: ahora,
    });
    if (nueva.estado === 'completada' && !nueva.completada_at) nueva.completada_at = ahora;
    this.db.tareas.push(nueva);
    this._guardar();
    return structuredClone(nueva);
  }

  async actualizarTarea(id, cambios) {
    const t = this.db.tareas.find(x => x.id === id);
    if (!t) throw new ErrorDatos('La tarea ya no existe.');
    const limpio = limpiarParaGuardar(cambios);
    // Igual que el trigger de la base de datos: completada_at se gestiona solo.
    if (limpio.estado && limpio.estado !== t.estado) {
      limpio.completada_at = limpio.estado === 'completada' ? new Date().toISOString() : null;
    }
    Object.assign(t, limpio, { updated_at: new Date().toISOString() });
    this._guardar();
    return normalizarTarea(structuredClone(t));
  }

  async eliminarTarea(id) {
    this.db.tareas = this.db.tareas.filter(x => x.id !== id);
    this.db.actividad = this.db.actividad.filter(a => a.tarea_id !== id);
    this._guardar();
  }

  async actividad(tareaId) { return this.db.actividad.filter(a => a.tarea_id === tareaId).sort((a, b) => a.created_at.localeCompare(b.created_at)); }

  async registrarActividad(tareaId, tipo, texto) {
    const a = { id: Util.uid(), tarea_id: tareaId, tipo, texto, autor_id: this.perfil?.id, autor_nombre: this.perfil?.nombre, created_at: new Date().toISOString() };
    this.db.actividad.push(a);
    this._guardar();
    return a;
  }

  async importarTareas(lista, alAvanzar) {
    const refs = new Set(this.db.tareas.map(t => t.origen_ref).filter(Boolean));
    let n = 0;
    for (const t of lista) {
      if (t.origen_ref && refs.has(t.origen_ref)) continue;
      await this.crearTarea(t);
      if (t.origen_ref) refs.add(t.origen_ref);
      n++;
    }
    alAvanzar?.(lista.length, lista.length);
    return n;
  }

  suscribir(cb) {
    // Sincroniza entre pestañas del mismo navegador.
    window.addEventListener('storage', e => {
      if (e.key !== this.CLAVE) return;
      try { this.db = JSON.parse(e.newValue); cb('recargar'); } catch { /* ignorar */ }
    });
    cb('estado', null, null, true);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Datos de ejemplo para el modo demo
// ─────────────────────────────────────────────────────────────────────
const DatosDemo = {
  generar() {
    const hoy = Util.hoyISO();
    const colaboradores = [
      { id: 'u-admin', nombre: 'Administrador', correo: 'admin@demo.co', rol: 'admin' },
      { id: 'u-ana', nombre: 'Ana Gómez', correo: 'ana@demo.co', rol: 'colaborador' },
      { id: 'u-carlos', nombre: 'Carlos Ruiz', correo: 'carlos@demo.co', rol: 'colaborador' },
      { id: 'u-yohana', nombre: 'Yohana Pérez', correo: 'yohana@demo.co', rol: 'colaborador' },
      { id: 'u-andres', nombre: 'Andrés Mora', correo: 'andres@demo.co', rol: 'colaborador' },
    ];
    const empresas = ['Comercial Andina SAS', 'Inversiones del Valle', 'Textiles Medellín', 'Agro Caribe', 'Logística Bogotá'];
    const plantillas = [
      ['Declaración de IVA bimestral', 'Tributario', 'alta'],
      ['Retención en la fuente', 'Tributario', 'urgente'],
      ['Conciliación bancaria', 'Contable', 'media'],
      ['Liquidación de nómina', 'Nómina', 'alta'],
      ['Cierre contable mensual', 'Contable', 'alta'],
      ['Informe exógena', 'Tributario', 'media'],
      ['Reunión de seguimiento con cliente', 'Cliente', 'baja'],
      ['Revisión de soportes', 'Auditoría', 'media'],
      ['ICA municipal', 'Tributario', 'alta'],
      ['Actualizar RUT', 'Administrativo', 'baja'],
    ];
    // Generador pseudoaleatorio con semilla: los datos demo son siempre iguales.
    let semilla = 7;
    const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
    const elegir = arr => arr[Math.floor(azar() * arr.length)];
    const ts = (iso, h = 10) => { const d = Util.deISO(iso); d.setHours(h); return d.toISOString(); };

    const tareas = [];
    const equipo = colaboradores.filter(c => c.rol !== 'admin');
    // Cada colaborador tiene un ritmo distinto para que el rendimiento varíe.
    const ritmo = { 'u-ana': 0.92, 'u-carlos': 0.7, 'u-yohana': 0.82, 'u-andres': 0.5 };
    for (let i = 0; i < 64; i++) {
      const c = equipo[i % equipo.length];
      const [titulo, categoria, prioridad] = elegir(plantillas);
      const offset = Math.round(azar() * 70) - 45; // de -45 a +25 días
      const vence = Util.sumarDias(hoy, offset);
      const creada = Util.sumarDias(vence, -(3 + Math.round(azar() * 10)));
      let estado = 'pendiente', completada_at = null;
      if (offset < 0) {
        if (azar() < ritmo[c.id]) {
          estado = 'completada';
          const retraso = azar() < ritmo[c.id] ? -Math.round(azar() * 3) : 1 + Math.round(azar() * 5);
          completada_at = ts(Util.sumarDias(vence, retraso) > hoy ? hoy : Util.sumarDias(vence, retraso));
        } else {
          estado = elegir(['pendiente', 'en_progreso']);
        }
      } else {
        estado = elegir(['pendiente', 'pendiente', 'en_progreso', 'en_revision', 'completada']);
        if (estado === 'completada') completada_at = ts(hoy, 8);
      }
      const checklist = azar() < 0.5 ? [
        { id: Util.uid(), texto: 'Recopilar información', hecho: estado !== 'pendiente' },
        { id: Util.uid(), texto: 'Preparar borrador', hecho: estado === 'completada' || estado === 'en_revision' },
        { id: Util.uid(), texto: 'Validar y enviar', hecho: estado === 'completada' },
      ] : [];
      tareas.push({
        id: 't-' + i, titulo, descripcion: '', asignado_a: c.id, asignado_nombre: null, creado_por: 'u-admin',
        empresa: elegir(empresas), categoria, prioridad, estado,
        fecha_inicio: null, fecha_vencimiento: vence,
        progreso: estado === 'completada' ? 100 : estado === 'en_revision' ? 80 : estado === 'en_progreso' ? 40 : 0,
        checklist, etiquetas: [], completada_at, origen_ref: null,
        created_at: ts(creada, 9), updated_at: ts(creada, 9),
      });
    }
    return { colaboradores, tareas, actividad: [] };
  },
};

const Datos = MODO_DEMO ? new LocalStore() : new SupabaseStore();
