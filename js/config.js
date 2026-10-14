// ═══════════════════════════════════════════════════════════════════
// CONFIGURACIÓN GENERAL
// Todo lo que cambia entre instalaciones vive aquí. El resto del código
// solo lee estas constantes.
// ═══════════════════════════════════════════════════════════════════

const CONFIG = {
  // ── Supabase ──────────────────────────────────────────────────────
  // La clave "anon" es pública por diseño: la seguridad real la dan
  // las políticas RLS que configuras en Supabase.
  SUPABASE_URL: 'https://azjkdqnnqwkrtzgtlgul.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6amtkcW5ucXdrcnR6Z3RsZ3VsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTYwNDksImV4cCI6MjA5NzczMjA0OX0.o_S2K7UeXCvgVEouhLOtpuBFMy6im8YDJiFrDIq0LKc',

  TABLAS: {
    tareas: 'tareas',
    actividad: 'tarea_actividad',
    perfiles: 'perfiles',
  },

  // ── Microsoft Teams (opcional) ────────────────────────────────────
  // No subas la URL real a un repositorio público: incluye una firma secreta.
  TEAMS_WEBHOOK_URL: '',
  // Canal por colaborador: { 'NOMBRE EXACTO DEL PERFIL': 'https://...' }
  TEAMS_WEBHOOKS_POR_COLABORADOR: {},

  // ── Reglas de la interfaz ─────────────────────────────────────────
  // Supabase (RLS) es quien realmente permite o niega cada operación.
  // Estas opciones solo deciden qué botones y vistas muestra la página.
  ROLES_ADMIN: ['admin', 'lider', 'supervisor'],
  COLABORADORES_VEN_EQUIPO: true,          // un colaborador puede ver las tareas del equipo
  COLABORADORES_ASIGNAN_A_OTROS: false,    // un colaborador puede asignar tareas a otros

  DIAS_ALERTA: 3,          // "por vencer" = vence dentro de N días
  SEMANAS_TENDENCIA: 12,   // semanas en la gráfica de tendencia
  LIMITE_LISTA: 300,       // filas visibles en la vista Lista antes de "Ver más"
};

const ESTADOS = [
  { id: 'pendiente',   label: 'Pendiente',   icon: '○' },
  { id: 'en_progreso', label: 'En progreso', icon: '▷' },
  { id: 'en_revision', label: 'En revisión', icon: '◎' },
  { id: 'completada',  label: 'Completada',  icon: '✓' },
];

const PRIORIDADES = [
  { id: 'urgente', label: 'Urgente', icon: '⏫' },
  { id: 'alta',    label: 'Alta',    icon: '🔺' },
  { id: 'media',   label: 'Media',   icon: '◆' },
  { id: 'baja',    label: 'Baja',    icon: '🔻' },
];

const CATEGORIAS = ['Tributario', 'Contable', 'Nómina', 'Auditoría', 'Cliente', 'Administrativo', 'Otro'];

// Paleta categórica para identificar colaboradores (orden fijo, validada para daltonismo).
const PALETA_COLABORADORES = {
  claro:  ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  oscuro: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

// Modo demo: sin Supabase configurado, o abriendo la página con ?demo=1.
// Guarda todo en el navegador; sirve para probar sin tocar datos reales.
const MODO_DEMO = new URLSearchParams(location.search).has('demo')
  || !CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('TU_');
