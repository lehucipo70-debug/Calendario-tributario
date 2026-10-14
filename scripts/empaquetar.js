// Genera dist/planner-equipo.html: un solo archivo con todo el CSS y JS incluidos.
// Uso: npm run empaquetar
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="css/styles.css">',
  () => '<style>\n' + fs.readFileSync(path.join(raiz, 'css/styles.css'), 'utf8') + '\n</style>');
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g,
  (_, archivo) => '<script>\n/* ── ' + archivo + ' ── */\n' + fs.readFileSync(path.join(raiz, archivo), 'utf8').replace(/<\/script/gi, '<\\/script') + '\n</script>');
fs.mkdirSync(path.join(raiz, 'dist'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'dist/planner-equipo.html'), html);
console.log('dist/planner-equipo.html (' + Math.round(html.length / 1024) + ' KB)');
