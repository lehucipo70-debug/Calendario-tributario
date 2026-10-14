// ═══════════════════════════════════════════════════════════════════
// MÉTRICAS DE RENDIMIENTO — funciones puras (se prueban en tests/)
//
// Índice de rendimiento (0–100) de un colaborador en un periodo:
//   evaluables  = tareas completadas + tareas vencidas sin completar
//                 (las que aún no vencen no cuentan ni a favor ni en contra)
//   cumplimiento = completadas / evaluables
//   puntualidad  = completadas a tiempo / completadas con fecha límite
//   índice       = 50 % cumplimiento + 50 % puntualidad
//                  (si ninguna completada tenía fecha, solo cumplimiento)
// ═══════════════════════════════════════════════════════════════════

const Metricas = (() => {
  const U = typeof Util !== 'undefined' ? Util : require('./utils.js').Util;
  const DIAS_ALERTA = typeof CONFIG !== 'undefined' ? CONFIG.DIAS_ALERTA : 3;

  function estaCompletada(t) { return t.estado === 'completada'; }

  // pendiente | en_progreso | en_revision | completada | vencida
  function estadoEfectivo(t, hoy) {
    if (estaCompletada(t)) return 'completada';
    if (t.fecha_vencimiento && t.fecha_vencimiento < hoy) return 'vencida';
    return t.estado || 'pendiente';
  }

  function porVencer(t, hoy) {
    if (estaCompletada(t) || !t.fecha_vencimiento) return false;
    return t.fecha_vencimiento >= hoy && t.fecha_vencimiento <= U.sumarDias(hoy, DIAS_ALERTA);
  }

  // true / false; null si no se puede evaluar (sin fecha límite o sin completar)
  function aTiempo(t) {
    if (!estaCompletada(t) || !t.fecha_vencimiento) return null;
    const fin = U.fechaDeTimestamp(t.completada_at) || t.fecha_vencimiento;
    return fin <= t.fecha_vencimiento;
  }

  function rangoPeriodo(periodo, hoy) {
    const d = U.deISO(hoy);
    const y = d.getFullYear(), m = d.getMonth();
    const iso = (yy, mm, dd) => U.aISO(new Date(yy, mm, dd));
    switch (periodo) {
      case 'semana': { const desde = U.inicioSemana(hoy); return { desde, hasta: U.sumarDias(desde, 6) }; }
      case 'mes': return { desde: iso(y, m, 1), hasta: iso(y, m + 1, 0) };
      case 'mes_anterior': return { desde: iso(y, m - 1, 1), hasta: iso(y, m, 0) };
      case 'trimestre': { const q = Math.floor(m / 3) * 3; return { desde: iso(y, q, 1), hasta: iso(y, q + 3, 0) }; }
      case 'anio': return { desde: iso(y, 0, 1), hasta: iso(y, 11, 31) };
      default: return { desde: null, hasta: null };
    }
  }

  // Fecha con la que una tarea "pertenece" a un periodo: su vencimiento o, si no tiene, su creación.
  function fechaReferencia(t) {
    return t.fecha_vencimiento || U.fechaDeTimestamp(t.created_at);
  }

  function enRango(t, rango) {
    if (!rango.desde) return true;
    const f = fechaReferencia(t);
    return !!f && f >= rango.desde && f <= rango.hasta;
  }

  function claveColaborador(t) {
    if (t.asignado_a) return t.asignado_a;
    if (t.asignado_nombre) return 'n:' + U.normalizar(t.asignado_nombre);
    return 'sin';
  }

  function calcular(tareas, hoy) {
    const r = { total: tareas.length, completadas: 0, aTiempo: 0, tarde: 0, conFecha: 0, vencidas: 0, enCurso: 0, porVencer: 0, diasTotales: 0, diasMuestras: 0 };
    for (const t of tareas) {
      const est = estadoEfectivo(t, hoy);
      if (est === 'completada') {
        r.completadas++;
        const ok = aTiempo(t);
        if (ok !== null) { r.conFecha++; ok ? r.aTiempo++ : r.tarde++; }
        const ini = U.fechaDeTimestamp(t.created_at), fin = U.fechaDeTimestamp(t.completada_at);
        if (ini && fin) { r.diasTotales += Math.max(0, U.diasEntre(ini, fin)); r.diasMuestras++; }
      } else if (est === 'vencida') {
        r.vencidas++;
      } else {
        r.enCurso++;
        if (porVencer(t, hoy)) r.porVencer++;
      }
    }
    const evaluables = r.completadas + r.vencidas;
    r.cumplimiento = evaluables ? r.completadas / evaluables : null;
    r.puntualidad = r.conFecha ? r.aTiempo / r.conFecha : null;
    r.indice = r.cumplimiento === null ? null
      : Math.round(100 * (r.puntualidad === null ? r.cumplimiento : 0.5 * r.cumplimiento + 0.5 * r.puntualidad));
    r.diasPromedio = r.diasMuestras ? r.diasTotales / r.diasMuestras : null;
    return r;
  }

  // Una fila por colaborador (incluye a quienes no tienen tareas en el periodo).
  function porColaborador(tareas, colaboradores, { periodo = 'todo', hoy = U.hoyISO() } = {}) {
    const rango = rangoPeriodo(periodo, hoy);
    const delPeriodo = tareas.filter(t => enRango(t, rango));
    const grupos = U.agruparPor(delPeriodo, claveColaborador);
    const filas = [];
    const vistos = new Set();

    for (const c of colaboradores) {
      vistos.add(c.id);
      filas.push({ clave: c.id, nombre: c.nombre, colaborador: c, ...calcular(grupos.get(c.id) || [], hoy) });
    }
    for (const [clave, lista] of grupos) {
      if (vistos.has(clave)) continue;
      const nombre = clave === 'sin' ? 'Sin asignar' : (lista[0].asignado_nombre || 'Sin asignar');
      filas.push({ clave, nombre, colaborador: null, ...calcular(lista, hoy) });
    }
    return filas;
  }

  function resumenEquipo(filas) {
    const s = { total: 0, completadas: 0, aTiempo: 0, conFecha: 0, vencidas: 0, enCurso: 0, porVencer: 0 };
    for (const f of filas) for (const k in s) s[k] += f[k];
    const evaluables = s.completadas + s.vencidas;
    s.cumplimiento = evaluables ? s.completadas / evaluables : null;
    s.puntualidad = s.conFecha ? s.aTiempo / s.conFecha : null;
    const conIndice = filas.filter(f => f.indice !== null && f.colaborador);
    s.indicePromedio = conIndice.length ? Math.round(conIndice.reduce((a, f) => a + f.indice, 0) / conIndice.length) : null;
    return s;
  }

  // Tareas completadas por semana (lunes a domingo), las últimas N semanas.
  function tendenciaSemanal(tareas, semanas, hoy = U.hoyISO()) {
    const actual = U.inicioSemana(hoy);
    const serie = [];
    for (let i = semanas - 1; i >= 0; i--) serie.push({ semana: U.sumarDias(actual, -7 * i), completadas: 0, aTiempo: 0 });
    const idx = new Map(serie.map((s, i) => [s.semana, i]));
    for (const t of tareas) {
      if (!estaCompletada(t)) continue;
      const fin = U.fechaDeTimestamp(t.completada_at);
      if (!fin) continue;
      const i = idx.get(U.inicioSemana(fin));
      if (i === undefined) continue;
      serie[i].completadas++;
      if (aTiempo(t) !== false) serie[i].aTiempo++;
    }
    return serie;
  }

  function nivel(indice) {
    if (indice === null || indice === undefined) return { id: 'na', label: 'Sin datos', icon: '—' };
    if (indice >= 85) return { id: 'excelente', label: 'Excelente', icon: '★' };
    if (indice >= 70) return { id: 'bueno', label: 'Bueno', icon: '▲' };
    if (indice >= 50) return { id: 'regular', label: 'Regular', icon: '■' };
    return { id: 'bajo', label: 'Bajo', icon: '▼' };
  }

  return { estadoEfectivo, porVencer, aTiempo, rangoPeriodo, enRango, claveColaborador, calcular, porColaborador, resumenEquipo, tendenciaSemanal, nivel };
})();

if (typeof module !== 'undefined') module.exports = { Metricas };
