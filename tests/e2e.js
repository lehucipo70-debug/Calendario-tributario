// ═══════════════════════════════════════════════════════════════════
// Pruebas de funcionalidad en navegador real (Chromium + Playwright).
//
//   npm install && npm run test:e2e
//
// · Modo demo: recorre todas las vistas como administrador y como colaboradora.
// · Modo Supabase: la app real habla con un Supabase simulado (auth + REST)
//   para probar inicio de sesión, paginación, permisos y errores.
// Las librerías de CDN se sirven desde node_modules (sin internet).
// Guarda capturas en tests/capturas/.
// ═══════════════════════════════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const XLSX = require('xlsx');

const RAIZ = path.join(__dirname, '..');
const CAPTURAS = path.join(__dirname, 'capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });

const CDN = {
  'supabase.js': require.resolve('@supabase/supabase-js/dist/umd/supabase.js'),
  'three.min.js': require.resolve('three/build/three.min.js'),
  'xlsx.full.min.js': require.resolve('xlsx/dist/xlsx.full.min.js'),
};

// ── utilidades de prueba ────────────────────────────────────────────
let fallos = 0, pasos = 0;
async function paso(nombre, fn) {
  try { await fn(); pasos++; console.log('  ✓ ' + nombre); }
  catch (e) { fallos++; console.log('  ✗ ' + nombre + '\n      ' + String(e.stack || e).split('\n').slice(0, 4).join('\n      ')); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }
function igual(a, b, msg) { if (a !== b) throw new Error(`${msg}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`); }
const isoLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const hoyISO = () => isoLocal(new Date());
const masDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d); };

// ── servidor estático ───────────────────────────────────────────────
function servidor() {
  const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  const srv = http.createServer((req, res) => {
    const ruta = path.join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!ruta.startsWith(RAIZ) || !fs.existsSync(ruta) || fs.statSync(ruta).isDirectory()) {
      const idx = path.join(ruta, 'index.html');
      if (fs.existsSync(idx)) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(fs.readFileSync(idx)); }
      res.writeHead(404); return res.end();
    }
    res.writeHead(200, { 'Content-Type': tipos[path.extname(ruta)] || 'application/octet-stream' });
    res.end(fs.readFileSync(ruta));
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

async function nuevaPagina(navegador, { viewport = { width: 1400, height: 900 }, backend = null } = {}) {
  const ctx = await navegador.newContext({ viewport, acceptDownloads: true, timezoneId: 'America/Bogota', locale: 'es-CO' });
  const page = await ctx.newPage();
  page.errores = [];
  page.on('pageerror', e => page.errores.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/websocket|realtime|ERR_|Failed to load resource/i.test(t)) return; // tiempo real sin servidor en pruebas
    page.errores.push('console: ' + t);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/, r => {
    const archivo = Object.keys(CDN).find(k => r.request().url().endsWith(k));
    return archivo ? r.fulfill({ path: CDN[archivo], contentType: 'text/javascript' }) : r.abort();
  });
  if (backend) await page.route(/supabase\.co/, r => backend.atender(r));
  return page;
}

async function esperarToast(page, texto) {
  await page.locator('.toast', { hasText: texto }).first().waitFor({ timeout: 4000 });
}

async function arrastrar(page, origen, destino) {
  // Arrastre HTML5 con DataTransfer real (dragAndDrop de Playwright no siempre dispara drop en DnD nativo).
  await page.evaluate(([o, d]) => {
    const a = document.querySelector(o), b = document.querySelector(d);
    if (!a || !b) throw new Error('arrastrar: no se encontró ' + (!a ? o : d));
    const dt = new DataTransfer();
    a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    b.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    b.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    a.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  }, [origen, destino]);
  await repintado(page);
}

// La app repinta en el siguiente cuadro de animación: esperar dos cuadros.
const repintado = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
async function clic(page, sel) { await page.click(sel); await repintado(page); }

const tareaLocal = (page, titulo) => page.evaluate(t => App.estado.tareas.find(x => x.titulo === t), titulo);

// ═══════════════════════════════════════════════════════════════════
// MODO DEMO
// ═══════════════════════════════════════════════════════════════════
async function pruebasDemo(navegador, base) {
  console.log('\nModo demo — administrador');
  const page = await nuevaPagina(navegador);
  const url = base + '/?demo=1';

  await paso('carga la pantalla de inicio de sesión con la ayuda del modo demo', async () => {
    await page.goto(url);
    await page.locator('#login').waitFor();
    ok(await page.locator('#demo-tip').isVisible(), 'falta la ayuda del modo demo');
    await page.screenshot({ path: path.join(CAPTURAS, '01-login.png') });
  });

  await paso('inicia sesión como administrador', async () => {
    await page.fill('#inp-email', 'admin@demo.co');
    await page.fill('#inp-pass', 'x');
    await clic(page, '#btn-entrar');
    await page.locator('#app').waitFor();
    await page.locator('.hero').waitFor();
    igual(await page.locator('#titulo-vista').textContent(), 'Inicio', 'título de vista');
    const nav = await page.locator('#nav button .nav-texto').allTextContents();
    igual(nav.join(','), 'Inicio,Tablero,Lista,Calendario,Rendimiento,Colaboradores,Administración', 'menú del administrador');
    ok(await page.locator('.equipo-fila').count() >= 3, 'falta el resumen del equipo');
    await page.screenshot({ path: path.join(CAPTURAS, '02-inicio.png'), fullPage: true });
  });

  await paso('captura rápida crea una tarea para hoy', async () => {
    await page.fill('[data-captura] input', 'Llamar al banco');
    await page.press('[data-captura] input', 'Enter');
    await esperarToast(page, 'Tarea creada');
    const t = await tareaLocal(page, 'Llamar al banco');
    ok(t, 'no se creó la tarea');
    igual(t.fecha_vencimiento, hoyISO(), 'fecha de la captura rápida');
    igual(t.asignado_a, 'u-admin', 'asignada a quien la crea');
    await page.locator('.panel', { hasText: '◷ Hoy' }).locator('.tarjeta', { hasText: 'Llamar al banco' }).waitFor();
    igual(await page.evaluate(() => document.activeElement?.closest('[data-captura]') !== null), true, 'el foco vuelve a la captura');
  });

  await paso('crea una tarea completa desde la ventana (asignada, con pasos)', async () => {
    await clic(page, '.btn-nueva');
    await page.locator('#form-tarea').waitFor();
    await page.fill('#form-tarea [name=titulo]', 'Declaración renta Agro');
    await page.selectOption('#form-tarea [name=asignado_a]', 'u-carlos');
    await page.selectOption('#form-tarea [name=prioridad]', 'urgente');
    await page.fill('#form-tarea [name=categoria]', 'Tributario');
    await page.fill('#form-tarea [name=empresa]', 'Agro Caribe');
    await page.fill('#form-tarea [name=fecha_vencimiento]', masDias(3));
    for (const paso of ['Reunir soportes', 'Presentar en DIAN']) {
      await page.fill('#check-input', paso);
      await page.press('#check-input', 'Enter');
    }
    igual(await page.locator('#checklist li').count(), 2, 'pasos agregados');
    ok(await page.locator('#bloque-progreso').isHidden(), 'con pasos el progreso manual se oculta');
    await clic(page, '#btn-guardar');
    await page.locator('#modal').waitFor({ state: 'hidden' });
    const t = await tareaLocal(page, 'Declaración renta Agro');
    igual(t.asignado_a, 'u-carlos', 'asignado');
    igual(t.prioridad, 'urgente', 'prioridad');
    igual(t.checklist.length, 2, 'pasos guardados');
    igual(t.fecha_vencimiento, masDias(3), 'fecha límite');
  });

  await paso('valida el formulario (título obligatorio, fechas coherentes)', async () => {
    await page.keyboard.press('n');
    await page.locator('#form-tarea').waitFor();
    await clic(page, '#btn-guardar');
    await esperarToast(page, 'Escribe el nombre');
    await page.fill('#form-tarea [name=titulo]', 'Fechas al revés');
    await page.fill('#form-tarea [name=fecha_inicio]', masDias(5));
    await page.fill('#form-tarea [name=fecha_vencimiento]', masDias(1));
    await clic(page, '#btn-guardar');
    await esperarToast(page, 'fecha de inicio');
    ok(!(await tareaLocal(page, 'Fechas al revés')), 'no debía guardarse');
    await page.keyboard.press('Escape');
    await page.locator('#modal').waitFor({ state: 'hidden' });
  });

  await paso('seguimiento: marcar un paso y comentar', async () => {
    await clic(page, '[data-accion=ir][data-vista=lista]');
    await page.fill('[data-filtro=texto]', 'renta agro');
    await page.locator('.enlace-tarea', { hasText: 'Declaración renta Agro' }).click();
    await page.locator('#timeline li', { hasText: 'Creó la tarea' }).waitFor();
    await page.locator('#checklist input[type=checkbox]').first().check();
    await page.fill('#comentario', 'Soportes recibidos del cliente');
    await clic(page, '[data-accion=comentar]');
    await page.locator('#timeline .tl-comentario', { hasText: 'Soportes recibidos' }).waitFor();
    await page.screenshot({ path: path.join(CAPTURAS, '03-tarea.png') });
    await clic(page, '#btn-guardar');
    await page.locator('#modal').waitFor({ state: 'hidden' });
    const t = await tareaLocal(page, 'Declaración renta Agro');
    igual(t.progreso, 50, 'progreso calculado por pasos');
    igual(t.checklist.filter(i => i.hecho).length, 1, 'paso marcado');
  });

  await paso('lista: buscar conserva el foco y ordenar/cambiar estado funcionan', async () => {
    await page.fill('[data-filtro=texto]', '');
    await page.locator('[data-filtro=texto]').pressSequentially('banco');
    await repintado(page);
    igual(await page.inputValue('[data-filtro=texto]'), 'banco', 'el buscador no pierde letras');
    igual(await page.locator('tbody tr').count(), 1, 'filas filtradas');
    await clic(page, '[data-accion=limpiar-filtros]');
    ok(await page.locator('tbody tr').count() > 20, 'al limpiar vuelven todas');
    // "Vence" es el orden inicial (ascendente): un clic lo invierte
    await clic(page, '[data-accion=ordenar][data-campo=fecha_vencimiento]');
    ok((await page.locator('.th-orden.on').textContent()).includes('▼'), 'indicador de orden descendente');
    const fechas = await page.evaluate(() => Vistas.lista.ordenar(App.tareasVisibles()).map(t => t.fecha_vencimiento || '9999'));
    ok(fechas.every((f, i) => i === 0 || fechas[i - 1] >= f), 'orden descendente por fecha');
    await page.fill('[data-filtro=texto]', 'banco');
    await repintado(page);
    await page.selectOption('tbody tr select[data-cambio=estado]', 'en_revision');
    await repintado(page);
    await esperarToast(page, 'Estado: En revisión');
    igual((await tareaLocal(page, 'Llamar al banco')).estado, 'en_revision', 'estado cambiado desde la lista');
    await clic(page, '[data-accion=limpiar-filtros]');
    await page.screenshot({ path: path.join(CAPTURAS, '04-lista.png') });
  });

  await paso('tablero: arrastrar a "Completada" y deshacer', async () => {
    await clic(page, '[data-accion=ir][data-vista=tablero]');
    igual(await page.locator('.columna').count(), 4, 'cuatro columnas por estado');
    const id = (await tareaLocal(page, 'Llamar al banco')).id;
    await arrastrar(page, `.tarjeta[data-id="${id}"]`, '.columna[data-valor=completada]');
    await esperarToast(page, 'Movida a Completada');
    const t = await tareaLocal(page, 'Llamar al banco');
    igual(t.estado, 'completada', 'estado tras arrastrar');
    ok(t.completada_at, 'completada_at fijado');
    await page.locator(`.columna[data-valor=completada] .tarjeta[data-id="${id}"]`).waitFor();
    await page.locator('.toast', { hasText: 'Movida a Completada' }).locator('button', { hasText: 'Deshacer' }).click();
    await esperarToast(page, 'Cambio revertido');
    const r = await tareaLocal(page, 'Llamar al banco');
    igual(r.estado, 'en_revision', 'deshacer restaura el estado');
    igual(r.completada_at, null, 'deshacer limpia completada_at');
    await page.screenshot({ path: path.join(CAPTURAS, '05-tablero.png') });
  });

  await paso('tablero agrupado por colaborador reasigna al arrastrar', async () => {
    await clic(page, '[data-accion=agrupar][data-valor=colaborador]');
    igual(await page.locator('.columna').count(), 6, '5 colaboradores + sin asignar');
    const id = (await tareaLocal(page, 'Llamar al banco')).id;
    await arrastrar(page, `.tarjeta[data-id="${id}"]`, '.columna[data-valor=u-yohana]');
    await esperarToast(page, 'Asignada a Yohana');
    igual((await tareaLocal(page, 'Llamar al banco')).asignado_a, 'u-yohana', 'reasignada');
    await clic(page, '[data-accion=agrupar][data-valor=estado]');
  });

  await paso('completar con el botón ✓ de la tarjeta', async () => {
    const id = (await tareaLocal(page, 'Declaración renta Agro')).id;
    await clic(page, `.tarjeta[data-id="${id}"] .check`);
    await esperarToast(page, 'Tarea completada');
    const t = await tareaLocal(page, 'Declaración renta Agro');
    igual(t.estado, 'completada', 'completada');
    igual(t.progreso, 100, 'progreso 100');
  });

  await paso('calendario mensual: muestra tareas y reprograma al arrastrar', async () => {
    await clic(page, '[data-accion=ir][data-vista=calendario]');
    igual(await page.locator('.mes-cab').count(), 7, 'encabezados de días');
    igual(await page.locator('.mes-cab').first().textContent(), 'Lun', 'la semana empieza en lunes');
    ok(await page.locator('.dia.es-hoy').count() === 1, 'hoy resaltado');
    const id = (await tareaLocal(page, 'Llamar al banco')).id;
    await page.locator(`.dia[data-valor="${hoyISO()}"] [data-id="${id}"], .dia[data-valor="${hoyISO()}"] .ev-mas`).first().waitFor();
    const destino = masDias(1);
    const visible = await page.locator(`.ev[data-id="${id}"]`).count();
    if (visible) {
      await arrastrar(page, `.ev[data-id="${id}"]`, `.dia[data-valor="${destino}"]`);
    } else {
      await page.evaluate(([i, d]) => App.mover(i, 'fecha_vencimiento', d), [id, destino]);
    }
    await esperarToast(page, 'Reprogramada');
    igual((await tareaLocal(page, 'Llamar al banco')).fecha_vencimiento, destino, 'nueva fecha');
    await page.screenshot({ path: path.join(CAPTURAS, '06-calendario-mes.png'), fullPage: true });
  });

  await paso('calendario: clic en un día abre "nueva tarea" con esa fecha', async () => {
    const dia = masDias(2);
    await page.locator(`.dia[data-valor="${dia}"] .dia-cab`).click();
    await page.locator('#form-tarea').waitFor();
    igual(await page.inputValue('#form-tarea [name=fecha_vencimiento]'), dia, 'fecha precargada');
    await page.keyboard.press('Escape');
  });

  await paso('calendario: navegar meses, vista semanal y "+N más"', async () => {
    const titulo = await page.locator('.cal-titulo').textContent();
    await clic(page, '[data-accion=cal-mover][data-dir="1"]');
    ok((await page.locator('.cal-titulo').textContent()) !== titulo, 'cambia de mes');
    await clic(page, '[data-accion=cal-hoy]');
    igual(await page.locator('.cal-titulo').textContent(), titulo, 'vuelve a hoy');
    const mas = page.locator('.ev-mas').first();
    if (await mas.count()) {
      await mas.click();
      ok(await page.locator('#modal .tarjeta').count() >= 3, 'el detalle del día lista las tareas');
      await page.keyboard.press('Escape');
    }
    await clic(page, '[data-accion=cal-modo][data-valor=semana]');
    igual(await page.locator('.semana-dia').count(), 7, 'siete días en la semana');
    await page.screenshot({ path: path.join(CAPTURAS, '07-calendario-semana.png') });
    await clic(page, '[data-accion=cal-modo][data-valor=mes]');
  });

  await paso('rendimiento: tabla, barras, tendencia y cambio de periodo', async () => {
    await clic(page, '[data-accion=ir][data-vista=rendimiento]');
    const filas = await page.locator('.tabla-rend tbody tr').count();
    ok(filas >= 4, 'una fila por colaborador con tareas (' + filas + ')');
    ok(await page.locator('.barra-fila').count() >= 4, 'barras por colaborador');
    ok(await page.locator('.grafica-linea .banda').count() === 12, '12 semanas en la tendencia');
    const indices = await page.locator('.tabla-rend .nivel').allTextContents();
    ok(indices.some(t => /\d/.test(t)), 'hay índices numéricos');
    // El índice de la tabla debe coincidir con el cálculo de Metricas
    const esperado = await page.evaluate(() => Metricas.porColaborador(App.estado.tareas, App.estado.colaboradores, { periodo: 'mes' }).find(f => f.clave === 'u-ana').indice);
    const celda = await page.locator('.tabla-rend tr', { hasText: 'Ana Gómez' }).locator('.nivel').textContent();
    ok(celda.includes(String(esperado ?? 'Sin datos')), `índice de Ana ${esperado} en la tabla (${celda})`);
    await page.screenshot({ path: path.join(CAPTURAS, '08-rendimiento.png'), fullPage: true });
    await clic(page, '[data-accion=periodo][data-valor=todo]');
    const total = await page.evaluate(() => App.estado.tareas.length);
    const kpi = await page.locator('.kpi', { hasText: 'Tareas del periodo' }).locator('.kpi-valor').textContent();
    igual(Number(kpi), total, 'en "Todo" cuenta todas las tareas');
    await page.locator('.seg').first().hover();
    ok(await page.locator('#tooltip').isVisible(), 'tooltip al pasar sobre la barra');
    await page.locator('.tabla-rend tr', { hasText: 'Carlos Ruiz' }).click();
    await repintado(page);
    igual(await page.locator('#titulo-vista').textContent(), 'Lista', 'clic en fila lleva a la lista');
    igual(await page.inputValue('[data-filtro=colaborador]'), 'u-carlos', 'filtrada por colaborador');
    await clic(page, '[data-accion=limpiar-filtros]');
  });

  await paso('colaboradores: tarjetas con carga e índice', async () => {
    await clic(page, '[data-accion=ir][data-vista=colaboradores]');
    igual(await page.locator('.colab').count(), 5, 'cinco colaboradores');
    await page.locator('.colab', { hasText: 'Andrés Mora' }).locator('[data-accion=nueva-tarea]').click();
    igual(await page.inputValue('#form-tarea [name=asignado_a]'), 'u-andres', 'asignar desde la tarjeta');
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(CAPTURAS, '09-colaboradores.png'), fullPage: true });
  });

  await paso('admin: exportar a Excel descarga un .xlsx legible', async () => {
    await clic(page, '[data-accion=ir][data-vista=admin]');
    const [descarga] = await Promise.all([page.waitForEvent('download'), page.click('[data-accion=exportar-todo]')]);
    ok(descarga.suggestedFilename().endsWith('.xlsx'), 'nombre ' + descarga.suggestedFilename());
    const ruta = path.join(CAPTURAS, 'export.xlsx');
    await descarga.saveAs(ruta);
    const filas = XLSX.utils.sheet_to_json(XLSX.readFile(ruta).Sheets.Tareas);
    const total = await page.evaluate(() => App.estado.tareas.length);
    igual(filas.length, total, 'filas exportadas');
    ok(filas.some(f => f.Tarea === 'Declaración renta Agro' && f.Colaborador === 'Carlos Ruiz' && f.Estado === 'Completada'), 'contenido exportado');
  });

  await paso('admin: importar Excel (planner + calendario anterior) sin duplicar', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['TAREA', 'COLABORADOR', 'FECHA LIMITE', 'PRIORIDAD', 'ESTADO'],
      ['Importada uno', 'Ana Gómez', new Date(2026, 9, 20), 'Alta', 'Pendiente'],
      ['Importada dos', 'Persona Nueva', '25/10/2026', '', 'Completado'],
    ]), 'Planner');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['EMPRESA', 'NIT', 'CONTADOR', 'TIPO DE IMPUESTO', 'PERÍODO', 'FECHA VENCIMIENTO'],
      ['Textiles SAS', '900', 'YOHANA', 'IVA', 'Bimestre 5', '2026-11-10'],
    ]), 'IMPUESTOS 2026');
    const archivo = path.join(CAPTURAS, 'importar.xlsx');
    XLSX.writeFile(wb, archivo);
    const antes = await page.evaluate(() => App.estado.tareas.length);
    await page.setInputFiles('#archivo-excel', archivo);
    await page.locator('#imp-estado', { hasText: 'Listo' }).waitFor({ timeout: 8000 });
    const log = await page.locator('#imp-log').textContent();
    ok(log.includes('Persona Nueva'), 'avisa del nombre sin perfil');
    igual(await page.evaluate(() => App.estado.tareas.length), antes + 3, 'tres tareas nuevas');
    const uno = await tareaLocal(page, 'Importada uno');
    igual(uno.asignado_a, 'u-ana', 'asociada por nombre');
    igual(uno.fecha_vencimiento, '2026-10-20', 'fecha de celda Excel');
    igual(uno.categoria, 'Otro', 'categoría por defecto (TAREA no es AREA)');
    const iva = await tareaLocal(page, 'IVA · Bimestre 5');
    igual(iva.asignado_a, 'u-yohana', 'contador → colaborador');
    await page.keyboard.press('Escape');
    await page.setInputFiles('#archivo-excel', archivo);
    await page.locator('#imp-estado', { hasText: 'Listo' }).waitFor({ timeout: 8000 });
    igual(await page.evaluate(() => App.estado.tareas.length), antes + 3, 'reimportar no duplica');
    await page.keyboard.press('Escape');
  });

  await paso('tema oscuro y persistencia tras recargar', async () => {
    await clic(page, '#btn-tema');
    igual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'tema oscuro');
    await clic(page, '[data-accion=ir][data-vista=rendimiento]');
    await page.screenshot({ path: path.join(CAPTURAS, '10-rendimiento-oscuro.png'), fullPage: true });
    await clic(page, '[data-accion=ir][data-vista=tablero]');
    await page.screenshot({ path: path.join(CAPTURAS, '11-tablero-oscuro.png') });
    await page.reload();
    await page.locator('.columna').first().waitFor();
    igual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'el tema se recuerda');
    igual(await page.locator('#titulo-vista').textContent(), 'Tablero', 'la vista se recuerda (#/tablero)');
    ok(await tareaLocal(page, 'Declaración renta Agro'), 'los datos persisten');
    await clic(page, '#btn-tema');
  });

  await paso('eliminar una tarea', async () => {
    const id = (await tareaLocal(page, 'Importada dos')).id;
    page.once('dialog', d => d.accept());
    await page.evaluate(i => TareaModal.abrir(i), id);
    await clic(page, '[data-accion=eliminar-tarea]');
    await page.locator('#modal').waitFor({ state: 'hidden' });
    ok(!(await tareaLocal(page, 'Importada dos')), 'eliminada');
  });

  await paso('sin errores de JavaScript (administrador)', async () => {
    igual(page.errores.length, 0, 'errores: ' + page.errores.join(' | '));
  });

  await paso('cerrar sesión vuelve al login', async () => {
    await clic(page, '[data-accion=salir]');
    await page.locator('#login').waitFor();
    ok(await page.locator('#app').isHidden(), 'app oculta');
  });

  // ── colaboradora ──────────────────────────────────────────────────
  console.log('\nModo demo — colaboradora');
  await paso('inicia sesión como colaboradora con vista "Mis tareas"', async () => {
    await page.fill('#inp-email', 'ana@demo.co');
    await clic(page, '#btn-entrar');
    await page.locator('.hero').waitFor();
    const nav = await page.locator('#nav button .nav-texto').allTextContents();
    ok(!nav.includes('Administración'), 'no ve Administración');
    await clic(page, '[data-accion=ir][data-vista=lista]');
    ok(await page.locator('[data-accion=alcance][data-valor=mias].on').count() === 1, 'arranca en Mis tareas');
    const ajenas = await page.evaluate(() => App.tareasVisibles().filter(t => t.asignado_a !== 'u-ana').length);
    igual(ajenas, 0, 'solo sus tareas');
  });

  await paso('colaboradora: solo puede asignarse tareas a sí misma', async () => {
    await clic(page, '.btn-nueva');
    const opciones = await page.locator('#form-tarea [name=asignado_a] option').allTextContents();
    igual(opciones.join(','), 'Ana Gómez', 'opciones de asignación');
    await page.fill('#form-tarea [name=titulo]', 'Tarea de Ana');
    await clic(page, '#btn-guardar');
    await page.locator('#modal').waitFor({ state: 'hidden' });
    igual((await tareaLocal(page, 'Tarea de Ana')).asignado_a, 'u-ana', 'asignada a sí misma');
    const id = (await tareaLocal(page, 'Tarea de Ana')).id;
    await page.evaluate(i => App.mover(i, 'asignado_a', 'u-carlos'), id);
    await esperarToast(page, 'Solo un administrador');
    igual((await tareaLocal(page, 'Tarea de Ana')).asignado_a, 'u-ana', 'no se reasignó');
  });

  await paso('colaboradora: ve el equipo pero no edita tareas ajenas', async () => {
    await clic(page, '[data-accion=alcance][data-valor=equipo]');
    const ajena = await page.evaluate(() => App.estado.tareas.find(t => t.asignado_a === 'u-carlos' && t.creado_por !== 'u-ana'));
    await page.locator('.enlace-tarea').first().waitFor();
    ok(await page.locator(`tr:has([data-id="${ajena.id}"]) .check`).count() === 0, 'sin botón completar en tarea ajena');
    await page.evaluate(i => TareaModal.abrir(i), ajena.id);
    ok(await page.locator('#form-tarea [name=titulo]').isDisabled(), 'formulario de solo lectura');
    ok(await page.locator('#btn-guardar').count() === 0, 'sin botón guardar');
    ok(await page.locator('[data-accion=eliminar-tarea]').count() === 0, 'sin botón eliminar');
    await page.keyboard.press('Escape');
  });

  await paso('colaboradora: rendimiento solo propio', async () => {
    await clic(page, '[data-accion=ir][data-vista=rendimiento]');
    const nombres = await page.locator('.tabla-rend tbody tr').allTextContents();
    igual(nombres.length, 1, 'una sola fila');
    ok(nombres[0].includes('Ana Gómez'), 'su propia fila');
    ok(await page.locator('.kpi', { hasText: 'Tu índice' }).count() === 1, 'KPI personal');
  });

  await paso('sin errores de JavaScript (colaboradora)', async () => {
    igual(page.errores.length, 0, 'errores: ' + page.errores.join(' | '));
  });
  await page.context().close();

  // ── móvil ─────────────────────────────────────────────────────────
  console.log('\nModo demo — móvil (390 px)');
  const movil = await nuevaPagina(navegador, { viewport: { width: 390, height: 844 } });
  await paso('en móvil no hay desbordamiento horizontal y el menú abre', async () => {
    await movil.goto(url);
    await movil.fill('#inp-email', 'admin@demo.co');
    await clic(movil, '#btn-entrar');
    await movil.locator('.hero').waitFor();
    for (const vista of ['inicio', 'lista', 'calendario', 'rendimiento', 'colaboradores']) {
      await movil.evaluate(v => App.ir(v), vista);
      await movil.waitForTimeout(80);
      const ancho = await movil.evaluate(() => document.documentElement.scrollWidth);
      ok(ancho <= 390, `${vista}: ancho ${ancho}px`);
      if (vista === 'inicio' || vista === 'calendario') await movil.screenshot({ path: path.join(CAPTURAS, `12-movil-${vista}.png`), fullPage: true });
    }
    ok(await movil.locator('.lateral').evaluate(e => e.getBoundingClientRect().right <= 0), 'menú oculto');
    await clic(movil, '.menu-movil');
    await movil.waitForTimeout(300);
    ok(await movil.locator('.lateral').evaluate(e => e.getBoundingClientRect().left >= 0), 'menú visible');
    await clic(movil, '[data-accion=ir][data-vista=tablero]');
    await movil.waitForTimeout(300);
    ok(await movil.locator('.lateral').evaluate(e => e.getBoundingClientRect().right <= 0), 'el menú se cierra al navegar');
    igual(movil.errores.length, 0, 'errores: ' + movil.errores.join(' | '));
  });
  await movil.context().close();
}

// ═══════════════════════════════════════════════════════════════════
// SUPABASE SIMULADO (GoTrue + PostgREST mínimos)
// Aplica las mismas reglas que supabase/permisos-ejemplo.sql.
// ═══════════════════════════════════════════════════════════════════
class SupabaseFalso {
  constructor({ tareas = 0, faltaEsquema = false } = {}) {
    this.faltaEsquema = faltaEsquema;
    this.peticiones = [];
    this.usuarios = {
      'admin@x.co': { id: 'a0000000-0000-0000-0000-000000000000', pass: 'secreta' },
      'ana@x.co': { id: 'a1000000-0000-0000-0000-000000000000', pass: 'secreta' },
    };
    this.perfiles = [
      { id: 'a0000000-0000-0000-0000-000000000000', nombre: 'Laura Admin', rol: 'admin', correo: 'admin@x.co' },
      { id: 'a1000000-0000-0000-0000-000000000000', nombre: 'Ana Gómez', rol: 'contador', correo: 'ana@x.co' },
      { id: 'c1000000-0000-0000-0000-000000000000', nombre: 'Carlos Ruiz', rol: 'colaborador', correo: 'carlos@x.co' },
    ];
    this.tareas = [];
    for (let i = 0; i < tareas; i++) {
      const dueno = this.perfiles[1 + (i % 2)].id;
      this.tareas.push(this.completar({ id: `t-${String(i).padStart(5, '0')}`, titulo: 'Tarea ' + i, asignado_a: dueno, creado_por: this.perfiles[0].id, fecha_vencimiento: masDias((i % 40) - 20) }));
    }
    this.actividad = [];
  }

  completar(t) {
    const ahora = new Date().toISOString();
    return { descripcion: null, asignado_nombre: null, empresa: null, categoria: 'Otro', prioridad: 'media', estado: 'pendiente', fecha_inicio: null,
      fecha_vencimiento: null, progreso: 0, checklist: [], etiquetas: [], completada_at: null, origen_ref: null, created_at: ahora, updated_at: ahora, ...t };
  }

  esAdmin(uid) { return this.perfiles.find(p => p.id === uid)?.rol === 'admin'; }

  responder(r, status, cuerpo, headers = {}) {
    return r.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: cuerpo === undefined ? '' : JSON.stringify(cuerpo) });
  }

  async atender(r) {
    const req = r.request();
    const url = new URL(req.url());
    const metodo = req.method();
    if (metodo === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const h = req.headers();
    const uid = (h.authorization || '').startsWith('Bearer tok-') ? h.authorization.slice(11) : null;
    const cuerpo = req.postData() ? JSON.parse(req.postData()) : null;
    this.peticiones.push({ metodo, ruta: url.pathname, query: url.search, cuerpo, uid });

    // ── Auth ──
    if (url.pathname === '/auth/v1/token') {
      const u = this.usuarios[cuerpo.email];
      if (!u || u.pass !== cuerpo.password) return this.responder(r, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      return this.responder(r, 200, {
        access_token: 'tok-' + u.id, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'r-' + u.id, user: { id: u.id, email: cuerpo.email, aud: 'authenticated', role: 'authenticated' },
      });
    }
    if (url.pathname === '/auth/v1/logout') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (url.pathname === '/auth/v1/user') return this.responder(r, 200, { id: uid, aud: 'authenticated' });

    // ── REST ──
    const tabla = url.pathname.replace('/rest/v1/', '');
    if (!uid) return this.responder(r, 401, { message: 'JWT required' });
    if (this.faltaEsquema && tabla !== 'perfiles') {
      return this.responder(r, 404, { code: 'PGRST205', message: `Could not find the table 'public.${tabla}' in the schema cache` });
    }
    const filtros = [...url.searchParams].filter(([k, v]) => /^(eq|neq)\./.test(v));
    const cumple = fila => filtros.every(([k, v]) => String(fila[k]) === v.slice(3));
    const objeto = (h.accept || '').includes('vnd.pgrst.object');
    const devolver = filas => {
      if (objeto) return filas.length === 1 ? this.responder(r, 200, filas[0])
        : this.responder(r, 406, { code: 'PGRST116', details: `The result contains ${filas.length} rows`, message: 'JSON object requested, multiple (or no) rows returned' });
      return this.responder(r, metodo === 'POST' ? 201 : 200, filas);
    };
    const coleccion = { perfiles: this.perfiles, tareas: this.tareas, tarea_actividad: this.actividad }[tabla];
    if (!coleccion) return this.responder(r, 404, { code: 'PGRST205', message: 'no table' });

    if (metodo === 'GET') {
      let filas = coleccion.filter(cumple);
      if (tabla === 'tareas') {
        filas = [...filas].sort((a, b) => (a.fecha_vencimiento || '9999').localeCompare(b.fecha_vencimiento || '9999') || a.id.localeCompare(b.id));
        const offset = +(url.searchParams.get('offset') || 0), limit = +(url.searchParams.get('limit') || 1000);
        filas = filas.slice(offset, offset + Math.min(limit, 1000)); // PostgREST: máx. 1000 por consulta
      }
      return devolver(filas);
    }
    if (metodo === 'POST' && tabla === 'tareas') {
      const lista = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
      const creadas = [];
      for (const fila of lista) {
        if (!this.esAdmin(uid) && fila.asignado_a && fila.asignado_a !== uid) return this.responder(r, 403, { code: '42501', message: 'new row violates row-level security policy for table "tareas"' });
        if (fila.origen_ref && this.tareas.some(t => t.origen_ref === fila.origen_ref)) continue;
        const t = this.completar({ ...fila, id: 'n-' + Math.random().toString(36).slice(2), creado_por: uid });
        if (t.estado === 'completada' && !t.completada_at) t.completada_at = new Date().toISOString();
        this.tareas.push(t); creadas.push(t);
      }
      return devolver(creadas);
    }
    if (metodo === 'POST' && tabla === 'tarea_actividad') {
      const a = { ...cuerpo, id: 'a-' + this.actividad.length, created_at: new Date().toISOString() };
      if (a.autor_id !== uid) return this.responder(r, 403, { code: '42501', message: 'row-level security' });
      this.actividad.push(a);
      return devolver([a]);
    }
    if (metodo === 'PATCH' && tabla === 'tareas') {
      // RLS: filas no permitidas simplemente no se actualizan (0 filas)
      const filas = this.tareas.filter(cumple).filter(t => this.esAdmin(uid) || t.creado_por === uid || t.asignado_a === uid);
      for (const t of filas) {
        const antes = t.estado;
        Object.assign(t, cuerpo, { updated_at: new Date().toISOString() });
        if (cuerpo.estado && cuerpo.estado !== antes) t.completada_at = cuerpo.estado === 'completada' ? new Date().toISOString() : null;
      }
      return devolver(filas);
    }
    if (metodo === 'DELETE' && tabla === 'tareas') {
      const filas = this.tareas.filter(cumple).filter(t => this.esAdmin(uid) || t.creado_por === uid);
      this.tareas = this.tareas.filter(t => !filas.includes(t));
      return devolver(filas);
    }
    return this.responder(r, 405, { message: 'no soportado' });
  }
}

async function pruebasSupabase(navegador, base) {
  console.log('\nModo Supabase (servidor simulado)');
  const backend = new SupabaseFalso({ tareas: 1203 });
  const page = await nuevaPagina(navegador, { backend });

  await paso('contraseña incorrecta muestra un error claro', async () => {
    await page.goto(base + '/');
    await page.locator('#login').waitFor();
    ok(await page.locator('#demo-tip').isHidden(), 'sin aviso de demo en producción');
    await page.fill('#inp-email', 'admin@x.co');
    await page.fill('#inp-pass', 'mala');
    await clic(page, '#btn-entrar');
    await page.locator('#login-msg', { hasText: 'Correo o contraseña incorrectos' }).waitFor();
  });

  await paso('inicia sesión y carga más de 1000 tareas (paginación)', async () => {
    await page.fill('#inp-pass', 'secreta');
    await clic(page, '#btn-entrar');
    await page.locator('.hero').waitFor();
    igual(await page.evaluate(() => App.estado.tareas.length), 1203, 'todas las tareas');
    igual(await page.evaluate(() => App.estado.perfil.nombre), 'Laura Admin', 'perfil leído de la tabla perfiles');
    const lecturas = backend.peticiones.filter(p => p.metodo === 'GET' && p.ruta.endsWith('/tareas'));
    igual(lecturas.length, 2, 'dos páginas de 1000');
    igual(await page.evaluate(() => App.estado.colaboradores.length), 3, 'colaboradores desde perfiles');
  });

  await paso('crear tarea envía solo columnas válidas y el creador', async () => {
    await page.evaluate(() => App.crear({ titulo: 'Desde Supabase', asignado_a: 'c1000000-0000-0000-0000-000000000000', fecha_vencimiento: '2026-12-01' }));
    const post = backend.peticiones.filter(p => p.metodo === 'POST' && p.ruta.endsWith('/tareas')).pop();
    igual(post.cuerpo.creado_por, 'a0000000-0000-0000-0000-000000000000', 'creado_por');
    ok(!('id' in post.cuerpo) && !('created_at' in post.cuerpo), 'no envía campos del servidor');
    ok(backend.tareas.some(t => t.titulo === 'Desde Supabase'), 'guardada en el servidor');
    await page.waitForTimeout(100);
    ok(backend.actividad.some(a => a.texto === 'Creó la tarea'), 'registra el seguimiento');
  });

  await paso('completar no envía completada_at (lo fija el servidor)', async () => {
    const id = await page.evaluate(() => App.estado.tareas.find(t => t.titulo === 'Desde Supabase').id);
    await page.evaluate(i => App.completar(i), id);
    await esperarToast(page, 'Tarea completada');
    const patch = backend.peticiones.filter(p => p.metodo === 'PATCH').pop();
    igual(JSON.stringify(patch.cuerpo), JSON.stringify({ estado: 'completada', progreso: 100 }), 'cuerpo del PATCH');
    const local = await page.evaluate(i => App.tarea(i), id);
    igual(local.completada_at, backend.tareas.find(t => t.id === id).completada_at, 'usa la fecha del servidor');
  });

  await paso('sin errores de JavaScript (Supabase admin)', async () => {
    igual(page.errores.length, 0, 'errores: ' + page.errores.join(' | '));
  });

  await paso('sesión guardada: recargar entra directo', async () => {
    await page.reload();
    await page.locator('.hero').waitFor();
    ok(await page.locator('#login').isHidden(), 'no pide login de nuevo');
    await clic(page, '[data-accion=salir]');
    await page.locator('#login').waitFor();
  });

  await paso('colaboradora: si la base de datos niega un cambio, se revierte y avisa', async () => {
    await page.fill('#inp-email', 'ana@x.co');
    await page.fill('#inp-pass', 'secreta');
    await clic(page, '#btn-entrar');
    await page.locator('.hero').waitFor();
    igual(await page.evaluate(() => Permisos.esAdmin()), false, 'rol "contador" se trata como colaborador');
    // Tarea suya en la página, pero el servidor la tiene asignada a otra persona (RLS la rechaza)
    const t = backend.tareas.find(x => x.asignado_a === 'a1000000-0000-0000-0000-000000000000');
    t.asignado_a = 'c1000000-0000-0000-0000-000000000000';
    const antes = await page.evaluate(i => App.tarea(i).estado, t.id);
    await page.evaluate(i => App.completar(i), t.id);
    await esperarToast(page, 'No tienes permiso');
    igual(await page.evaluate(i => App.tarea(i).estado, t.id), antes, 'el cambio se revirtió');
    page.errores = page.errores.filter(e => !/406|PGRST116/.test(e));
    igual(page.errores.length, 0, 'errores: ' + page.errores.join(' | '));
  });
  await page.context().close();

  const sinTablas = await nuevaPagina(navegador, { backend: new SupabaseFalso({ faltaEsquema: true }) });
  await paso('si faltan las tablas, muestra cómo configurarlas', async () => {
    await sinTablas.goto(base + '/');
    await sinTablas.fill('#inp-email', 'admin@x.co');
    await sinTablas.fill('#inp-pass', 'secreta');
    await sinTablas.click('#btn-entrar');
    await sinTablas.locator('.vacio', { hasText: 'Falta configurar la base de datos' }).waitFor();
    ok((await sinTablas.locator('.vacio').textContent()).includes('supabase/schema.sql'), 'indica el archivo');
    await sinTablas.screenshot({ path: path.join(CAPTURAS, '13-falta-esquema.png') });
  });
  await sinTablas.context().close();
}

(async () => {
  const srv = await servidor();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const navegador = await chromium.launch();
  try {
    await pruebasDemo(navegador, base);
    await pruebasSupabase(navegador, base);
  } finally {
    await navegador.close();
    srv.close();
  }
  console.log(`\n${pasos} pasos correctos, ${fallos} con fallos. Capturas en tests/capturas/`);
  process.exit(fallos ? 1 : 0);
})();
