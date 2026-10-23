// Pruebas de robustez: datos raros que la base de datos ACEPTA (o que llegan por la API
// sin pasar por la página) no deben romper la página ni ejecutar código.
// Uso: node tests/robustez.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const CDN = {
  'supabase.js': require.resolve('@supabase/supabase-js/dist/umd/supabase.js'),
  'three.min.js': require.resolve('three/build/three.min.js'),
  'xlsx.full.min.js': require.resolve('xlsx/dist/xlsx.full.min.js'),
};

let fallos = 0;
async function paso(nombre, fn) {
  try { await fn(); console.log('  ✓ ' + nombre); } catch (e) { fallos++; console.log('  ✗ ' + nombre + '\n      ' + e.message.split('\n')[0]); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };

function servidor() {
  return new Promise(r => {
    const srv = http.createServer((req, res) => {
      let ruta = path.join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (fs.existsSync(ruta) && fs.statSync(ruta).isDirectory()) ruta = path.join(ruta, 'index.html');
      if (!ruta.startsWith(RAIZ) || !fs.existsSync(ruta)) { res.writeHead(404); return res.end(); }
      const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
      res.writeHead(200, { 'Content-Type': tipos[path.extname(ruta)] || 'application/octet-stream' });
      res.end(fs.readFileSync(ruta));
    });
    srv.listen(0, '127.0.0.1', () => r(srv));
  });
}

const XSS = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
const ATRIB = '" onmouseover="window.__xss=(window.__xss||0)+1" data-x="';

// Tareas que una colaboradora podría guardar por la API sin pasar por la página.
function tareasMaliciosas(hoy) {
  const base = { descripcion: '', creado_por: 'u-ana', fecha_inicio: null, progreso: 0, etiquetas: [], completada_at: null, origen_ref: null, created_at: hoy + 'T10:00:00Z', updated_at: hoy + 'T10:00:00Z' };
  return [
    { ...base, id: 'm1', titulo: 'Checklist con basura', asignado_a: 'u-ana', estado: 'en_progreso', prioridad: 'alta', categoria: 'Otro', fecha_vencimiento: hoy, checklist: [null, 5, 'texto', { id: ATRIB, texto: XSS, hecho: true }] },
    { ...base, id: 'm2', titulo: XSS, asignado_a: 'u-ana', estado: 'pendiente', prioridad: 'media', categoria: XSS, empresa: XSS, descripcion: XSS, fecha_vencimiento: hoy, checklist: [] },
    { ...base, id: 'm3', titulo: 'Sin categoría ni fecha', asignado_a: 'u-ana', estado: 'pendiente', prioridad: 'baja', categoria: null, fecha_vencimiento: null, checklist: {} },
    { ...base, id: 'm4', titulo: 'Fecha muy antigua', asignado_a: 'u-ana', estado: 'pendiente', prioridad: 'urgente', categoria: 'Otro', fecha_vencimiento: '1900-01-01', checklist: [] },
    { ...base, id: 'm5', titulo: 'Fecha muy lejana', asignado_a: 'u-ana', estado: 'completada', completada_at: '9999-12-31T00:00:00Z', prioridad: 'media', categoria: 'Otro', fecha_vencimiento: '9999-12-31', checklist: [] },
    { ...base, id: 'm6', titulo: 'Colaborador borrado', asignado_a: 'u-no-existe', asignado_nombre: XSS, estado: 'pendiente', prioridad: 'media', categoria: 'Otro', fecha_vencimiento: hoy, checklist: [] },
    { ...base, id: 'm7', titulo: 'Descripción enorme', asignado_a: 'u-ana', estado: 'pendiente', prioridad: 'media', categoria: 'Otro', fecha_vencimiento: hoy, descripcion: 'x'.repeat(2_000_000), checklist: [] },
    { ...base, id: 'm8', titulo: 'Checklist item sin texto', asignado_a: 'u-ana', estado: 'en_revision', prioridad: 'media', categoria: 'Otro', fecha_vencimiento: hoy, checklist: [{ id: 'a', hecho: false }, { texto: 'sin id' }] },
  ];
}

(async () => {
  const srv = await servidor();
  const base = `http://127.0.0.1:${srv.address().port}/index.html?demo=1`;
  const nav = await chromium.launch();
  const ctx = await nav.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: 'America/Bogota', locale: 'es-CO' });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('dialog', d => d.accept());
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route(/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/, r => {
    const k = Object.keys(CDN).find(x => r.request().url().endsWith(x));
    return k ? r.fulfill({ path: CDN[k], contentType: 'text/javascript' }) : r.abort();
  });

  console.log('Robustez — datos maliciosos o dañados');
  await page.goto(base);
  await page.waitForFunction(() => localStorage.getItem('planner_demo_v1'));
  await page.evaluate(m => {
    const db = JSON.parse(localStorage.getItem('planner_demo_v1'));
    db.tareas.push(...m);
    localStorage.setItem('planner_demo_v1', JSON.stringify(db));
  }, tareasMaliciosas(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })));
  await page.reload();
  await page.fill('#inp-email', 'admin@demo.co');
  await page.fill('#inp-pass', 'x');
  await page.click('#btn-entrar');
  await page.locator('#app').waitFor();

  const repintar = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  for (const vista of ['inicio', 'tablero', 'lista', 'calendario', 'rendimiento', 'colaboradores', 'admin']) {
    await paso(`vista "${vista}" se pinta con datos dañados`, async () => {
      errores.length = 0;
      await page.click(`[data-accion=ir][data-vista=${vista}]`);
      await repintar();
      ok(errores.length === 0, 'error de JavaScript: ' + errores[0]);
      ok(await page.locator('#main').innerHTML() !== '', 'la vista quedó vacía');
    });
  }

  for (const id of ['m1', 'm2', 'm3', 'm6', 'm7', 'm8']) {
    await paso(`abrir la tarea ${id} no falla`, async () => {
      errores.length = 0;
      await page.evaluate(i => TareaModal.abrir(i), id);
      await repintar();
      ok(errores.length === 0, 'error de JavaScript: ' + errores[0]);
      ok(await page.locator('#form-tarea').count() === 1, 'no abrió la ventana');
      await page.evaluate(() => UI.cerrarModal());
    });
  }

  await paso('guardar la tarea con checklist dañada la deja limpia', async () => {
    errores.length = 0;
    await page.evaluate(() => TareaModal.abrir('m1'));
    await repintar();
    await page.fill('#form-tarea [name=titulo]', 'Checklist con basura (editada)');
    await page.fill('#check-input', 'Paso nuevo');
    await page.click('[data-accion=check-agregar]');
    await page.click('#btn-guardar');
    await page.waitForTimeout(300);
    ok(errores.length === 0, 'error de JavaScript: ' + errores[0]);
    const t = await page.evaluate(() => JSON.parse(localStorage.getItem('planner_demo_v1')).tareas.find(x => x.id === 'm1'));
    ok(t.titulo.endsWith('(editada)'), 'no se guardó');
    ok(t.checklist.length === 2 && t.checklist.every(i => i && typeof i.id === 'string' && typeof i.texto === 'string'), 'la checklist sigue dañada: ' + JSON.stringify(t.checklist));
  });

  await paso('ningún texto ejecutó código (XSS)', async () => {
    for (const v of ['tablero', 'lista', 'calendario']) {
      await page.click(`[data-accion=ir][data-vista=${v}]`);
      await repintar();
      for (const el of (await page.locator('.tarjeta, tbody tr').all()).slice(0, 40)) await el.hover({ timeout: 300 }).catch(() => {});
    }
    await page.evaluate(() => TareaModal.abrir('m1'));
    await repintar();
    for (const el of await page.locator('#checklist li, #checklist input').all()) await el.hover({ timeout: 300 }).catch(() => {});
    await page.waitForTimeout(300);
    const n = await page.evaluate(() => window.__xss || 0);
    ok(n === 0, `se ejecutó código inyectado ${n} vez/veces`);
  });

  await nav.close();
  srv.close();
  console.log(fallos ? `\n${fallos} prueba(s) con fallos` : '\nTodas las pruebas de robustez pasaron');
  process.exit(fallos ? 1 : 0);
})();
