// ═══════════════════════════════════════════════════════════════════
// UTILIDADES — funciones puras sin dependencias del DOM ni de datos
// ═══════════════════════════════════════════════════════════════════

const Util = {
  esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  uid() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  },

  normalizar(s) {
    return String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  },

  iniciales(nombre) {
    const partes = String(nombre || '?').trim().split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] || '?') + (partes[1]?.[0] || '')).toUpperCase();
  },

  // ── Fechas ──────────────────────────────────────────────────────────
  // Las fechas de tareas se guardan como 'AAAA-MM-DD' y se interpretan en
  // hora local. new Date('2026-07-14') las leería en UTC y en Colombia
  // (UTC-5) caerían un día antes.
  aISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  deISO(s) {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3]);
  },

  // Fecha local (AAAA-MM-DD) de un timestamp ISO completo.
  fechaDeTimestamp(ts) {
    if (!ts) return null;
    const d = new Date(ts);
    return isNaN(d) ? null : Util.aISO(d);
  },

  hoyISO() { return Util.aISO(new Date()); },

  sumarDias(iso, n) {
    const d = Util.deISO(iso);
    d.setDate(d.getDate() + n);
    return Util.aISO(d);
  },

  diasEntre(desdeISO, hastaISO) {
    const a = Util.deISO(desdeISO), b = Util.deISO(hastaISO);
    return Math.round((b - a) / 86400000);
  },

  // Lunes de la semana de una fecha (semana laboral colombiana empieza en lunes).
  inicioSemana(iso) {
    const d = Util.deISO(iso);
    const dia = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dia);
    return Util.aISO(d);
  },

  MESES: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  MESES_CORTOS: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  DIAS_CORTOS: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],

  fmtFecha(iso) {
    const d = Util.deISO(iso);
    if (!d) return '—';
    return d.getDate() + ' ' + Util.MESES_CORTOS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  },

  // "Hoy", "Mañana", "Ayer", "en 3 días", "hace 5 días"
  fmtRelativa(iso) {
    if (!iso) return 'Sin fecha';
    const n = Util.diasEntre(Util.hoyISO(), iso);
    if (n === 0) return 'Hoy';
    if (n === 1) return 'Mañana';
    if (n === -1) return 'Ayer';
    if (n > 1 && n <= 6) return 'En ' + n + ' días';
    if (n < -1 && n >= -30) return 'Hace ' + (-n) + ' días';
    return Util.fmtFecha(iso);
  },

  fmtFechaHora(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  },

  // 'AAAA-MM-DD' si es un día que existe (31/02 o mes 13 → null), entre 1900 y 2200.
  // Una sola fecha imposible haría fallar el lote completo al guardar en la base de datos.
  fechaValida(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const [a, mes, dia] = [+m[1], +m[2], +m[3]];
    const d = new Date(a, mes - 1, dia);
    return a >= 1900 && a <= 2200 && d.getFullYear() === a && d.getMonth() === mes - 1 && d.getDate() === dia ? iso : null;
  },

  // Convierte casi cualquier valor de celda de Excel a 'AAAA-MM-DD'.
  parsearFecha(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) {
      if (isNaN(v)) return null;
      // Las fechas de Excel a veces llegan corridas por zona horaria (p. ej. 19:00 del
      // día anterior = medianoche UTC en Colombia): de 18:00 en adelante es el día siguiente.
      const d = new Date(v);
      if (d.getHours() >= 18) d.setDate(d.getDate() + 1);
      return Util.aISO(d);
    }
    if (typeof v === 'number') {
      // Número de serie de Excel (días desde 1899-12-30)
      if (v > 20000 && v < 80000) return Util.aISO(new Date(Math.round((v - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000));
      return null;
    }
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return Util.fechaValida(s.substring(0, 10));
    const p = s.split(/[\/\-.]/);
    if (p.length === 3 && p.every(x => /^\d+$/.test(x))) {
      if (p[2].length === 4) return Util.fechaValida(p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0'));
      if (p[0].length === 4) return Util.fechaValida(p[0] + '-' + p[1].padStart(2, '0') + '-' + p[2].padStart(2, '0'));
    }
    if (!/[a-zA-Z]/.test(s)) return null; // números sueltos nunca son fechas
    const d = new Date(s);
    if (!isNaN(d) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) return Util.aISO(d);
    return null;
  },

  // ── Colores ─────────────────────────────────────────────────────────
  textoSobre(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.62 ? '#1b1a22' : '#ffffff';
  },

  pct(n, d) { return d ? Math.round((n / d) * 100) : 0; },

  agruparPor(arr, fn) {
    const m = new Map();
    for (const x of arr) {
      const k = fn(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  },
};

if (typeof module !== 'undefined') module.exports = { Util };
