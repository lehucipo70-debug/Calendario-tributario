// ═══════════════════════════════════════════════════════════════════
// PANTALLA DE INICIO DE SESIÓN (+ fondo 3D decorativo)
// ═══════════════════════════════════════════════════════════════════

const Login = {
  el: id => document.getElementById(id),

  mostrar() {
    this.el('login').hidden = false;
    this.el('demo-tip').hidden = Datos.modo !== 'demo';
    this.formulario('entrar');
    Escena3D.iniciar();
  },

  ocultar() {
    this.el('login').hidden = true;
    Escena3D.detener();
  },

  formulario(cual) {
    this.el('frm-entrar').hidden = cual !== 'entrar';
    this.el('frm-recuperar').hidden = cual !== 'recuperar';
    this.mensaje('', '');
  },

  mensaje(texto, tipo) {
    const m = this.el('login-msg');
    m.textContent = texto;
    m.className = 'login-msg ' + tipo;
    m.hidden = !texto;
  },
  error(texto) { this.mensaje(texto, 'error'); },

  async entrar(e) {
    e?.preventDefault();
    const email = this.el('inp-email').value.trim();
    const pass = this.el('inp-pass').value;
    if (!email || (!pass && Datos.modo !== 'demo')) { this.error('Ingresa correo y contraseña.'); return; }
    const btn = this.el('btn-entrar');
    btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      const perfil = await Datos.login(email, pass);
      this.el('inp-pass').value = '';
      await App.entrar(perfil);
    } catch (err) {
      this.error(err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Iniciar sesión';
    }
  },

  async recuperar(e) {
    e?.preventDefault();
    const email = this.el('inp-rec-email').value.trim();
    if (!email) { this.error('Ingresa tu correo.'); return; }
    try {
      await Datos.recuperar(email);
      this.mensaje('Enlace enviado. Revisa tu correo (también la carpeta de spam).', 'ok');
    } catch (err) { this.error(err.message); }
  },
};

const Escena3D = {
  s: null,

  detener() {
    if (!this.s) return;
    cancelAnimationFrame(this.s.frame);
    window.removeEventListener('mousemove', this.s.onMouse);
    window.removeEventListener('resize', this.s.onResize);
    this.s.renderer.dispose();
    this.s = null;
  },

  iniciar() {
    this.detener();
    const canvas = document.getElementById('login-canvas');
    if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof THREE === 'undefined') {
      // three.js se carga con defer: si aún no llegó, se reintenta al terminar la carga.
      if (document.readyState !== 'complete') addEventListener('load', () => { if (!document.getElementById('login').hidden) this.iniciar(); }, { once: true });
      return;
    }
    let w = innerWidth, h = innerHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 0, 8);
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return; }
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    const formas = [];
    const agregar = (r, x, y, z, color, op, tipo) => {
      const geo = tipo === 'box' ? new THREE.BoxGeometry(r, r, r) : tipo === 'octa' ? new THREE.OctahedronGeometry(r, 0) : new THREE.IcosahedronGeometry(r, tipo === 'ico1' ? 1 : 0);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: op }));
      mesh.position.set(x, y, z);
      mesh.userData.giro = { y: (Math.random() - 0.5) * 0.006, x: (Math.random() - 0.5) * 0.004 };
      scene.add(mesh); formas.push(mesh);
    };
    agregar(2.4, 3.4, 1.0, -3, 0x9d8fe8, 0.36, 'ico1');
    agregar(1.6, -3.8, -0.8, -2.5, 0xc9a35f, 0.30, 'ico');
    agregar(1.1, 2.8, -2.4, -1.5, 0xc9a35f, 0.26, 'octa');
    agregar(0.9, -2.6, 2.2, -1, 0x9d8fe8, 0.24, 'box');
    agregar(1.8, 0.2, 2.8, -3.5, 0xc9a35f, 0.20, 'ico');

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(1200 * 3);
    for (let i = 0; i < pos.length; i++) pos[i] = (Math.random() - 0.5) * (i % 3 === 2 ? 14 : 30);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const estrellas = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xb9aee8, size: 0.06, transparent: true, opacity: 0.55 }));
    scene.add(estrellas);

    let mx = 0, my = 0;
    const onMouse = e => { mx = (e.clientX / w - 0.5) * 2; my = (e.clientY / h - 0.5) * 2; };
    const onResize = () => { w = innerWidth; h = innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); };
    addEventListener('mousemove', onMouse);
    addEventListener('resize', onResize);

    const s = { renderer, onMouse, onResize, frame: 0 };
    const animar = () => {
      s.frame = requestAnimationFrame(animar);
      for (const f of formas) { f.rotation.y += f.userData.giro.y; f.rotation.x += f.userData.giro.x; }
      estrellas.rotation.y += 0.0009;
      camera.position.x += (mx * 1.5 - camera.position.x) * 0.05;
      camera.position.y += (-my * 1.1 - camera.position.y) * 0.05;
      camera.lookAt(scene.position);
      renderer.render(scene, camera);
    };
    animar();
    this.s = s;
  },
};
