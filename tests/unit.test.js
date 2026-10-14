// Pruebas unitarias de la lógica pura (métricas, fechas, importación).
// Ejecutar: npm test
// Las fechas se evalúan en hora local, como en el navegador del equipo (Colombia).
process.env.TZ = 'America/Bogota';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Util } = require('../js/utils.js');
const { Metricas } = require('../js/metricas.js');
const { Importador } = require('../js/importar.js');

const HOY = '2026-10-14';
const t = (o) => ({ estado: 'pendiente', prioridad: 'media', checklist: [], etiquetas: [], created_at: '2026-10-01T15:00:00Z', ...o });

test('fechas locales: no se corren un día por zona horaria', () => {
  assert.equal(Util.aISO(Util.deISO('2026-07-14')), '2026-07-14');
  assert.equal(Util.sumarDias('2026-02-27', 2), '2026-03-01');
  assert.equal(Util.inicioSemana('2026-10-14'), '2026-10-12'); // miércoles → lunes
  assert.equal(Util.inicioSemana('2026-10-18'), '2026-10-12'); // domingo → lunes anterior
  assert.equal(Util.diasEntre('2026-10-14', '2026-10-20'), 6);
});

test('parsearFecha acepta los formatos del Excel', () => {
  assert.equal(Util.parsearFecha('2026-07-14'), '2026-07-14');
  assert.equal(Util.parsearFecha('14/07/2026'), '2026-07-14');
  assert.equal(Util.parsearFecha('Tuesday, July 14, 2026'), '2026-07-14');
  assert.equal(Util.parsearFecha(46217), '2026-07-14'); // número de serie de Excel
  assert.equal(Util.parsearFecha(new Date(2026, 6, 13, 19, 0)), '2026-07-14'); // medianoche UTC vista desde Colombia
  assert.equal(Util.parsearFecha('137'), null);
  assert.equal(Util.parsearFecha(''), null);
});

test('estado efectivo: vencida solo si no está completada y ya pasó la fecha', () => {
  assert.equal(Metricas.estadoEfectivo(t({ fecha_vencimiento: '2026-10-13' }), HOY), 'vencida');
  assert.equal(Metricas.estadoEfectivo(t({ fecha_vencimiento: '2026-10-14' }), HOY), 'pendiente');
  assert.equal(Metricas.estadoEfectivo(t({ fecha_vencimiento: '2026-10-01', estado: 'completada' }), HOY), 'completada');
  assert.equal(Metricas.estadoEfectivo(t({ estado: 'en_revision' }), HOY), 'en_revision');
});

test('a tiempo / tarde según fecha de completado vs fecha límite', () => {
  assert.equal(Metricas.aTiempo(t({ estado: 'completada', fecha_vencimiento: '2026-10-10', completada_at: '2026-10-10T22:00:00-05:00' })), true);
  assert.equal(Metricas.aTiempo(t({ estado: 'completada', fecha_vencimiento: '2026-10-10', completada_at: '2026-10-12T10:00:00-05:00' })), false);
  assert.equal(Metricas.aTiempo(t({ estado: 'completada' })), null);
  assert.equal(Metricas.aTiempo(t({ fecha_vencimiento: '2026-10-10' })), null);
});

test('índice de rendimiento = 50% cumplimiento + 50% puntualidad', () => {
  const lista = [
    t({ estado: 'completada', fecha_vencimiento: '2026-10-05', completada_at: '2026-10-04T12:00:00-05:00' }), // a tiempo
    t({ estado: 'completada', fecha_vencimiento: '2026-10-05', completada_at: '2026-10-08T12:00:00-05:00' }), // tarde
    t({ estado: 'completada', fecha_vencimiento: '2026-10-06', completada_at: '2026-10-06T12:00:00-05:00' }), // a tiempo
    t({ fecha_vencimiento: '2026-10-07' }),                                                                // vencida
    t({ fecha_vencimiento: '2026-10-30' }),                                                                // en curso, no cuenta
  ];
  const r = Metricas.calcular(lista, HOY);
  assert.equal(r.completadas, 3);
  assert.equal(r.vencidas, 1);
  assert.equal(r.enCurso, 1);
  assert.equal(r.aTiempo, 2);
  assert.equal(r.tarde, 1);
  assert.equal(r.cumplimiento, 0.75);           // 3 / (3 + 1)
  assert.equal(Math.round(r.puntualidad * 100), 67); // 2 / 3
  assert.equal(r.indice, Math.round(100 * (0.5 * 0.75 + 0.5 * 2 / 3))); // 71
});

test('sin tareas evaluables el índice es nulo (no castiga tareas futuras)', () => {
  const r = Metricas.calcular([t({ fecha_vencimiento: '2026-11-01' })], HOY);
  assert.equal(r.indice, null);
  assert.equal(Metricas.nivel(r.indice).id, 'na');
});

test('rangos de periodo', () => {
  assert.deepEqual(Metricas.rangoPeriodo('mes', HOY), { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.deepEqual(Metricas.rangoPeriodo('mes_anterior', HOY), { desde: '2026-09-01', hasta: '2026-09-30' });
  assert.deepEqual(Metricas.rangoPeriodo('trimestre', HOY), { desde: '2026-10-01', hasta: '2026-12-31' });
  assert.deepEqual(Metricas.rangoPeriodo('semana', HOY), { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(Metricas.rangoPeriodo('mes', '2026-01-15'), { desde: '2026-01-01', hasta: '2026-01-31' });
  assert.deepEqual(Metricas.rangoPeriodo('mes_anterior', '2026-01-15'), { desde: '2025-12-01', hasta: '2025-12-31' });
});

test('porColaborador agrupa por persona e incluye a quien no tiene tareas', () => {
  const colabs = [{ id: 'a', nombre: 'Ana' }, { id: 'b', nombre: 'Beto' }];
  const lista = [
    t({ asignado_a: 'a', fecha_vencimiento: '2026-10-02', estado: 'completada', completada_at: '2026-10-01T12:00:00Z' }),
    t({ asignado_a: 'a', fecha_vencimiento: '2026-10-03' }),
    t({ asignado_nombre: 'YOHANA', fecha_vencimiento: '2026-10-20' }),
    t({ fecha_vencimiento: '2026-09-01' }), // fuera del mes
  ];
  const filas = Metricas.porColaborador(lista, colabs, { periodo: 'mes', hoy: HOY });
  const ana = filas.find(f => f.clave === 'a');
  assert.equal(ana.total, 2);
  assert.equal(ana.indice, 75); // cumplimiento 0.5, puntualidad 1
  assert.equal(filas.find(f => f.clave === 'b').total, 0);
  assert.equal(filas.find(f => f.nombre === 'YOHANA').total, 1);
  assert.ok(!filas.some(f => f.clave === 'sin'), 'la tarea de septiembre no entra en octubre');
  const eq = Metricas.resumenEquipo(filas);
  assert.equal(eq.total, 3);
  assert.equal(eq.indicePromedio, 75); // Beto no tiene índice, no baja el promedio
});

test('tendencia semanal cuenta completadas por semana', () => {
  const lista = [
    t({ estado: 'completada', completada_at: '2026-10-13T15:00:00Z', fecha_vencimiento: '2026-10-14' }),
    t({ estado: 'completada', completada_at: '2026-10-06T15:00:00Z', fecha_vencimiento: '2026-10-01' }),
    t({ estado: 'completada', completada_at: '2026-06-01T15:00:00Z' }), // fuera del rango
  ];
  const s = Metricas.tendenciaSemanal(lista, 4, HOY);
  assert.equal(s.length, 4);
  assert.deepEqual(s.map(x => x.semana), ['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']);
  assert.deepEqual(s.map(x => x.completadas), [0, 0, 1, 1]);
  assert.deepEqual(s.map(x => x.aTiempo), [0, 0, 0, 1]);
});

const COLABS = [{ id: 'u1', nombre: 'Yohana Pérez' }, { id: 'u2', nombre: 'Andrés Mora' }];

test('importar formato planner', () => {
  const { tareas, log } = Importador.filasATareas([{
    nombre: 'Hoja1',
    filas: [
      ['Planner octubre'],                                  // título suelto, no es encabezado
      ['TAREA', 'COLABORADOR', 'FECHA LÍMITE', 'FECHA INICIO', 'PRIORIDAD', 'ESTADO', 'EMPRESA'],
      ['Cierre mensual', 'yohana pérez', '2026-10-31', '2026-10-20', 'Alta', 'En progreso', 'Agro SAS'],
      ['Llamar cliente', 'Pedro', '05/11/2026', null, 'baja', 'Completado', null],
      [null, 'Andrés', '2026-10-01'],                      // sin título: se omite
    ],
  }], COLABS);
  assert.equal(tareas.length, 2);
  assert.match(log[0], /2 tareas/);
  const [a, b] = tareas;
  assert.equal(a.titulo, 'Cierre mensual');
  assert.equal(a.asignado_a, 'u1');
  assert.equal(a.fecha_vencimiento, '2026-10-31');
  assert.equal(a.fecha_inicio, '2026-10-20');
  assert.equal(a.prioridad, 'alta');
  assert.equal(a.estado, 'en_progreso');
  assert.equal(a.empresa, 'Agro SAS');
  assert.equal(a.categoria, 'Otro', 'la columna TAREA no debe tomarse como categoría (AREA)');
  assert.equal(b.asignado_a, null);
  assert.equal(b.asignado_nombre, 'Pedro');
  assert.equal(b.estado, 'completada');
  assert.equal(b.fecha_vencimiento, '2026-11-05');
  assert.ok(b.completada_at);
  assert.ok(log.some(l => l.includes('Pedro')));
});

test('importar calendario tributario anterior (plano y por meses)', () => {
  const { tareas } = Importador.filasATareas([
    {
      nombre: 'IMPUESTOS 2026',
      filas: [
        ['GRUPO', 'EMPRESA', 'NIT', 'CONTADOR', 'TIPO DE IMPUESTO', 'PERÍODO', 'FECHA VENCIMIENTO', 'FECHA ENTREGA'],
        ['JAT', 'Textiles SAS', '900123', 'ANDRES', 'IVA', 'Bimestre 5', '2026-11-10', '2026-11-05'],
        ['JAT', 'Textiles SAS', '900123', 'ANDRES', 'RETEFUENTE', 'Octubre', 'July 14, 2026', null],
      ],
    },
    {
      nombre: 'ICA',
      filas: [
        ['EMPRESA', 'CONTADOR', 'ENERO', 'FEBRERO', 'FECHA ENTREGA MARZO'],
        ['Agro SAS', 'YOHANA', '2026-01-20', '2026-02-20', '2026-03-01'],
      ],
    },
    { nombre: 'Notas', filas: [['cualquier cosa'], ['más texto']] },
  ], COLABS);
  assert.equal(tareas.length, 4);
  const iva = tareas[0];
  assert.equal(iva.titulo, 'IVA · Bimestre 5');
  assert.equal(iva.categoria, 'Tributario');
  assert.equal(iva.fecha_vencimiento, '2026-11-10'); // no toma FECHA ENTREGA
  assert.equal(iva.asignado_a, 'u2');                 // "ANDRES" → Andrés Mora por primer nombre
  assert.equal(tareas[1].fecha_vencimiento, '2026-07-14');
  assert.deepEqual(tareas.slice(2).map(x => x.titulo), ['ICA · Enero', 'ICA · Febrero']);
  assert.equal(tareas[2].asignado_a, 'u1');
});

test('reimportar el mismo archivo genera las mismas referencias (no duplica)', () => {
  const hoja = [{ nombre: 'H', filas: [['TAREA', 'FECHA', 'RESPONSABLE'], ['A', '2026-10-01', 'Ana'], ['B', '2026-10-02', 'Ana']] }];
  const r1 = Importador.filasATareas(hoja, []).tareas.map(x => x.origen_ref);
  const r2 = Importador.filasATareas(hoja, []).tareas.map(x => x.origen_ref);
  assert.deepEqual(r1, r2);
  assert.notEqual(r1[0], r1[1]);
});

test('mapeo de estados y prioridades', () => {
  assert.equal(Importador.mapearEstado('Presentado'), 'completada');
  assert.equal(Importador.mapearEstado('EN REVISIÓN'), 'en_revision');
  assert.equal(Importador.mapearEstado('en curso'), 'en_progreso');
  assert.equal(Importador.mapearEstado(''), 'pendiente');
  assert.equal(Importador.mapearPrioridad('Crítica'), 'urgente');
  assert.equal(Importador.mapearPrioridad(''), null);
});
