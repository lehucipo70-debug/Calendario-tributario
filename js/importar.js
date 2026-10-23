// ═══════════════════════════════════════════════════════════════════
// IMPORTAR / EXPORTAR EXCEL
// La conversión de filas a tareas (filasATareas) es pura y se prueba
// en tests/; la lectura del archivo usa SheetJS cargado bajo demanda.
// ═══════════════════════════════════════════════════════════════════

const Importador = (() => {
  const U = typeof Util !== 'undefined' ? Util : require('./utils.js').Util;
  const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

  const COLS = {
    titulo: ['TAREA', 'TITULO', 'ACTIVIDAD', 'ASUNTO'],
    colaborador: ['COLABORADOR', 'RESPONSABLE', 'ASIGNADO A', 'ASIGNADO', 'CONTADOR', 'ENCARGADO'],
    fecha: ['FECHA LIMITE', 'FECHA VENCIMIENTO', 'FECHA DE VENCIMIENTO', 'VENCIMIENTO', 'VENCE', 'FECHA'],
    fecha_inicio: ['FECHA INICIO', 'FECHA DE INICIO', 'INICIO'],
    empresa: ['EMPRESA', 'EMPRESAS', 'CLIENTE', 'RAZON SOCIAL', 'NOMBRE DE EMPRESA'],
    categoria: ['CATEGORIA', 'TIPO DE TAREA', 'AREA'],
    prioridad: ['PRIORIDAD'],
    estado: ['ESTADO'],
    descripcion: ['DESCRIPCION', 'DETALLE', 'OBSERVACIONES', 'NOTAS'],
    impuesto: ['TIPO DE IMPUESTO', 'IMPUESTO'],
    periodo: ['PERIODO'],
  };
  const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

  // Busca por prioridad de candidato: primero coincidencia exacta, luego por palabras
  // completas ("FECHA VENCIMIENTO 2026" sirve para VENCIMIENTO; "TAREA" no sirve para AREA).
  function buscarCol(cabeceras, candidatos, excluir = []) {
    const ok = h => !excluir.some(x => h.includes(x));
    const contiene = (h, c) => (' ' + h.replace(/[^A-Z0-9]+/g, ' ') + ' ').includes(' ' + c + ' ');
    for (const c of candidatos) { const i = cabeceras.findIndex(h => h === c && ok(h)); if (i >= 0) return i; }
    for (const c of candidatos) { const i = cabeceras.findIndex(h => contiene(h, c) && ok(h)); if (i >= 0) return i; }
    return -1;
  }

  function mapearEstado(v) {
    const s = U.normalizar(v);
    if (!s) return 'pendiente';
    // Negaciones primero: "No presentado", "Sin terminar" o "Incompleto" NO son tareas hechas.
    if (/(^| )(NO|SIN|FALTA|FALTAN)( |$)|INCOMPLET/.test(s)) return 'pendiente';
    if (/COMPLET|PRESENTAD|HECH|TERMINAD|FINALIZAD|CERRAD|^SI$|^OK$/.test(s)) return 'completada';
    if (/REVISI/.test(s)) return 'en_revision';
    if (/PROGRES|CURSO|PROCESO/.test(s)) return 'en_progreso';
    return 'pendiente';
  }

  function mapearPrioridad(v) {
    const s = U.normalizar(v);
    if (/URGENT|CRITIC/.test(s)) return 'urgente';
    if (/ALTA|HIGH/.test(s)) return 'alta';
    if (/BAJA|LOW/.test(s)) return 'baja';
    return s ? 'media' : null;
  }

  // Hash FNV-1a de 2×32 bits: referencia estable para no duplicar al reimportar.
  function huella(s) {
    let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      a = Math.imul(a ^ s.charCodeAt(i), 16777619);
      b = Math.imul(b ^ s.charCodeAt(s.length - 1 - i), 16777619);
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }

  function texto(v) { return v == null || v === 'null' ? '' : String(v).trim(); }

  // hojas: [{ nombre, filas: [[celda, …], …] }] → { tareas, log }
  function filasATareas(hojas, colaboradores) {
    // Nombre completo exacto; un nombre suelto ("Ana") solo si hay una sola persona con él.
    // Nunca por coincidencia parcial: "Carlos Pérez" no es "Carlos Ruiz".
    const sinEspacios = x => U.normalizar(x).replace(/\s+/g, ' ');
    const porNombre = new Map(), porPrimero = new Map();
    for (const c of colaboradores) {
      const n = sinEspacios(c.nombre);
      if (!n) continue;
      porNombre.set(n, c);
      const primero = n.split(' ')[0];
      porPrimero.set(primero, porPrimero.has(primero) ? null : c);
    }
    const asignar = nombre => {
      const n = sinEspacios(nombre);
      if (!n) return { asignado_a: null, asignado_nombre: null };
      const c = porNombre.get(n) || (!n.includes(' ') ? porPrimero.get(n) : null);
      return c ? { asignado_a: c.id, asignado_nombre: null } : { asignado_a: null, asignado_nombre: String(nombre).trim().slice(0, 200) };
    };

    const tareas = [], log = [];
    const sinCoincidencia = new Set();
    const vistas = new Map(); // filas idénticas en el archivo: cada una es una tarea distinta

    for (const hoja of hojas) {
      const filas = hoja.filas || [];
      let filaCab = -1, cab = [];
      for (let i = 0; i < Math.min(8, filas.length); i++) {
        const c = (filas[i] || []).map(U.normalizar);
        // Un título suelto ("CALENDARIO EMPRESAS 2026") no es encabezado: se exigen 2+ columnas.
        if (c.filter(Boolean).length >= 2 && c.some(h => COLS.titulo.includes(h) || COLS.empresa.some(e => h.includes(e)))) { filaCab = i; cab = c; break; }
      }
      if (filaCab < 0) { log.push(`· "${hoja.nombre}": sin encabezados reconocibles, se omite`); continue; }

      const col = {
        titulo: buscarCol(cab, COLS.titulo),
        colaborador: buscarCol(cab, COLS.colaborador),
        fecha: buscarCol(cab, COLS.fecha, ['INICIO', 'ENTREGA', 'PRESENTACION']),
        fecha_inicio: buscarCol(cab, COLS.fecha_inicio),
        empresa: buscarCol(cab, COLS.empresa),
        categoria: buscarCol(cab, COLS.categoria),
        prioridad: buscarCol(cab, COLS.prioridad),
        estado: buscarCol(cab, COLS.estado),
        descripcion: buscarCol(cab, COLS.descripcion),
        impuesto: buscarCol(cab, COLS.impuesto),
        periodo: buscarCol(cab, COLS.periodo),
      };
      const modoPlanner = col.titulo >= 0;
      const tributarioPlano = !modoPlanner && col.impuesto >= 0 && col.fecha >= 0;
      // Formato ancho del calendario tributario: una columna de fecha por mes.
      let colsMes = !modoPlanner && !tributarioPlano
        ? cab.map((h, i) => ({ i, mes: MESES.findIndex(m => h.includes(m)) })).filter(x => x.mes >= 0 && !cab[x.i].includes('ENTREGA'))
        : [];
      // Sin meses pero con una columna de vencimiento: una tarea por fila con el nombre de la hoja.
      if (!modoPlanner && !tributarioPlano && !colsMes.length && col.fecha >= 0) colsMes = [{ i: col.fecha, mes: -1 }];
      if (!modoPlanner && !tributarioPlano && !colsMes.length) { log.push(`· "${hoja.nombre}": no tiene columnas de tarea ni de fechas, se omite`); continue; }

      let n = 0;
      for (let r = filaCab + 1; r < filas.length; r++) {
        const f = filas[r] || [];
        const val = k => (col[k] >= 0 ? texto(f[col[k]]) : '');
        const empresa = val('empresa');
        const colab = val('colaborador');
        const base = {
          empresa: empresa.slice(0, 200) || null,
          descripcion: val('descripcion').slice(0, 10000) || null,
          ...asignar(colab),
        };
        if (colab && !base.asignado_a) sinCoincidencia.add(colab);

        const agregar = (titulo, fecha, extra = {}) => {
          const estado = col.estado >= 0 ? mapearEstado(f[col.estado]) : 'pendiente';
          const t = {
            ...base, titulo: titulo.slice(0, 300), fecha_vencimiento: fecha, estado,
            prioridad: mapearPrioridad(val('prioridad')) || extra.prioridad || 'media',
            categoria: (val('categoria') || extra.categoria || 'Otro').slice(0, 60),
            fecha_inicio: col.fecha_inicio >= 0 ? U.parsearFecha(f[col.fecha_inicio]) : null,
            progreso: estado === 'completada' ? 100 : 0,
            checklist: [], etiquetas: [],
            // Lo importado como completado se toma como entregado en su fecha límite.
            completada_at: estado === 'completada' && fecha ? U.deISO(fecha).toISOString() : null,
          };
          // Misma clave que antes (lo ya importado no se duplica); solo las repeticiones llevan #n.
          const clave = [hoja.nombre, t.titulo, empresa, fecha, colab].join('|');
          const repetida = (vistas.get(clave) || 0) + 1;
          vistas.set(clave, repetida);
          t.origen_ref = 'xls:' + huella(repetida > 1 ? clave + '|#' + repetida : clave);
          tareas.push(t);
          n++;
        };

        if (modoPlanner) {
          const titulo = val('titulo');
          if (titulo) agregar(titulo, U.parsearFecha(f[col.fecha]));
        } else if (tributarioPlano) {
          const imp = val('impuesto'), per = val('periodo'), fecha = U.parsearFecha(f[col.fecha]);
          if (imp && fecha && empresa) agregar(per ? `${imp} · ${per}` : imp, fecha, { categoria: 'Tributario', prioridad: 'alta' });
        } else if (empresa && U.normalizar(empresa) !== 'EMPRESA') {
          for (const { i, mes } of colsMes) {
            const fecha = U.parsearFecha(f[i]);
            const sufijo = mes >= 0 ? ' · ' + MESES[mes][0] + MESES[mes].slice(1).toLowerCase() : '';
            if (fecha) agregar(hoja.nombre + sufijo, fecha, { categoria: 'Tributario', prioridad: 'alta' });
          }
        }
      }
      log.push(`✓ "${hoja.nombre}": ${n} tareas`);
    }
    if (sinCoincidencia.size) {
      log.push(`⚠ ${sinCoincidencia.size} nombre(s) sin perfil en el sistema (quedan sin asignar, con el nombre guardado): ${[...sinCoincidencia].slice(0, 8).join(', ')}${sinCoincidencia.size > 8 ? '…' : ''}`);
    }
    return { tareas, log };
  }

  async function cargarXLSX() {
    if (window.XLSX) return;
    await new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = XLSX_URL; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar la librería de Excel (sin conexión).'));
      document.head.appendChild(s);
    });
  }

  function progreso(pct, estado, lineas) {
    const el = document.getElementById('imp-estado');
    if (!el) return;
    el.textContent = estado;
    document.getElementById('imp-barra').style.width = pct + '%';
    if (lineas) document.getElementById('imp-log').innerHTML = lineas.map(l => `<div>${U.esc(l)}</div>`).join('');
  }

  async function importarArchivo(archivo) {
    if (archivo.size > 20 * 1024 * 1024) { UI.toast('El archivo supera 20 MB.', { tipo: 'error' }); return; }
    UI.abrirModal(`<header class="modal-cab"><h3>Importar: ${U.esc(archivo.name)}</h3></header>
      <p id="imp-estado" class="muted">Leyendo archivo…</p>
      <div class="barra-progreso grande"><span id="imp-barra" style="width:5%"></span></div>
      <div id="imp-log" class="imp-log"></div>
      <div class="modal-pie"><span class="separador"></span><button class="btn" data-accion="cerrar-modal">Cerrar</button></div>`, { ancho: 520 });
    try {
      await cargarXLSX();
      progreso(20, 'Procesando hojas…');
      const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: true });
      const hojas = wb.SheetNames.map(nombre => ({ nombre, filas: XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, defval: null, raw: true }) }));
      const { tareas, log } = filasATareas(hojas, App.estado.colaboradores);
      if (!tareas.length) { progreso(100, 'No se encontraron tareas en el archivo.', log); return; }
      progreso(40, `Guardando ${tareas.length} tareas…`, log);
      const creadas = await Datos.importarTareas(tareas, (hechas, total) => progreso(40 + Math.round(55 * hechas / total), `Guardando… ${hechas}/${total}`));
      await App.cargar();
      App.render();
      progreso(100, `Listo: ${tareas.length} tareas procesadas${Datos.modo === 'demo' ? `, ${creadas} nuevas` : ' (las repetidas se omiten)'}.`, log);
    } catch (e) {
      console.error(e);
      progreso(100, '❌ ' + e.message);
    }
  }

  async function exportar(tareas) {
    const cab = ['Tarea', 'Colaborador', 'Empresa', 'Categoría', 'Prioridad', 'Estado', 'Fecha inicio', 'Fecha límite', 'Completada el', 'A tiempo', 'Progreso %', 'Descripción'];
    const hoy = U.hoyISO();
    const filas = tareas.map(t => {
      const ef = Metricas.estadoEfectivo(t, hoy);
      const at = Metricas.aTiempo(t);
      return [t.titulo, App.colaboradorDe(t)?.nombre || '', t.empresa || '', t.categoria || '',
        PRIORIDADES.find(p => p.id === t.prioridad)?.label || '', ef === 'vencida' ? 'Vencida' : ESTADOS.find(e => e.id === t.estado)?.label || '',
        t.fecha_inicio || '', t.fecha_vencimiento || '', U.fechaDeTimestamp(t.completada_at) || '', at === null ? '' : at ? 'Sí' : 'No',
        UI.progreso(t).pct, t.descripcion || ''];
    });
    const nombre = 'planner_tareas_' + hoy;
    try {
      await cargarXLSX();
      const ws = XLSX.utils.aoa_to_sheet([cab, ...filas]);
      ws['!cols'] = cab.map((h, i) => ({ wch: i === 0 || i === 11 ? 40 : 16 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tareas');
      XLSX.writeFile(wb, nombre + '.xlsx');
    } catch {
      // Sin la librería, se descarga CSV (Excel también lo abre).
      const csv = [cab, ...filas].map(f => f.map(v => /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = nombre + '.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    UI.toast(`${tareas.length} tareas exportadas`, { tipo: 'ok' });
  }

  return { filasATareas, mapearEstado, mapearPrioridad, huella, importarArchivo, exportar };
})();

if (typeof module !== 'undefined') module.exports = { Importador };
