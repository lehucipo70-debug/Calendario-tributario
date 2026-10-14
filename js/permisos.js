// ═══════════════════════════════════════════════════════════════════
// PERMISOS DE LA INTERFAZ
//
// Un solo lugar decide qué ve y qué puede intentar cada usuario.
// Esto NO reemplaza la seguridad: Supabase (políticas RLS) es quien
// realmente permite o rechaza cada lectura y escritura. Si la base de
// datos niega algo, la app muestra el error y revierte el cambio.
// ═══════════════════════════════════════════════════════════════════

const Permisos = {
  perfil: null,

  usar(perfil) { this.perfil = perfil; },

  get uid() { return this.perfil?.id; },

  esAdmin() { return CONFIG.ROLES_ADMIN.includes(this.perfil?.rol); },

  verEquipo() { return this.esAdmin() || CONFIG.COLABORADORES_VEN_EQUIPO; },

  verRendimientoEquipo() { return this.esAdmin(); },

  asignarAOtros() { return this.esAdmin() || CONFIG.COLABORADORES_ASIGNAN_A_OTROS; },

  crearTarea() { return !!this.perfil; },

  editarTarea(t) { return this.esAdmin() || t.creado_por === this.uid || t.asignado_a === this.uid; },

  eliminarTarea(t) { return this.esAdmin() || t.creado_por === this.uid; },

  importar() { return this.esAdmin(); },

  administrar() { return this.esAdmin(); },
};
