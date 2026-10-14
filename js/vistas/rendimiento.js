// ═══════════════════════════════════════════════════════════════════
// VISTA: RENDIMIENTO — indicadores por colaborador (tabla + gráficas)
// Un administrador ve a todo el equipo; un colaborador solo a sí mismo.
// La fórmula del índice está documentada en js/metricas.js.
// ═══════════════════════════════════════════════════════════════════

Vistas.rendimiento = {
  titulo: 'Rendimiento',
  icono: '📈',
  orden: 5,
  visible: () => true,

  PERIODOS: [['semana', 'Esta semana'], ['mes', 'Este mes'], ['mes_anterior', 'Mes anterior'], ['trimestre', 'Trimestre'], ['anio', 'Este año'], ['todo', 'Todo']],

  SEGMENTOS: [
    { clave: 'completadasOk', label: 'Completadas', color: 'var(--serie-ok)', icono: '✓' },
    { clave: 'tarde', label: 'Completadas con retraso', color: 'var(--serie-tarde)', icono: '◷' },
    { clave: 'enCurso', label: 'En curso', color: 'var(--serie-curso)', icono: '▷' },
    { clave: 'vencidas', label: 'Vencidas', color: 'var(--serie-vencida)', icono: '⚠' },
  ],

  datos() {
    const hoy = Util.hoyISO();
    const periodo = App.estado.rend.periodo;
    const equipo = Permisos.verRendimientoEquipo();
    const tareas = equipo ? App.estado.tareas : App.estado.tareas.filter(t => App.esMia(t));
    const colabs = equipo ? App.estado.colaboradores : [App.estado.perfil];
    let filas = Metricas.porColaborador(tareas, colabs, { periodo, hoy })
      .map(f => ({ ...f, completadasOk: f.completadas - f.tarde }));
    if (equipo) filas = filas.filter(f => f.total > 0 || (f.colaborador && !CONFIG.ROLES_ADMIN.includes(f.colaborador.rol)));
    filas.sort((a, b) => (b.indice ?? -1) - (a.indice ?? -1) || b.total - a.total);
    return { filas, tareas, resumen: Metricas.resumenEquipo(filas), equipo, hoy };
  },

  render() {
    const { filas, tareas, resumen, equipo, hoy } = this.datos();
    const periodo = App.estado.rend.periodo;
    const pct = v => v === null ? '—' : Math.round(v * 100) + '%';

    return `
      <div class="barra-vista">
        <div class="segmentado" role="group" aria-label="Periodo">
          ${this.PERIODOS.map(([v, l]) => `<button class="${periodo === v ? 'on' : ''}" data-accion="periodo" data-valor="${v}">${l}</button>`).join('')}
        </div>
        <span class="muted mini">${equipo ? 'Todo el equipo' : 'Tus indicadores personales'} · por fecha límite de la tarea</span>
      </div>

      <div class="kpis kpis-5">
        ${Vistas.inicio.kpi('Tareas del periodo', resumen.total, 'azul', '▦')}
        ${Vistas.inicio.kpi('Completadas', resumen.completadas, 'verde', '✓')}
        ${Vistas.inicio.kpi('Puntualidad', pct(resumen.puntualidad), 'ambar', '◷')}
        ${Vistas.inicio.kpi('Vencidas sin completar', resumen.vencidas, 'rojo', '⚠')}
        ${Vistas.inicio.kpi(equipo ? 'Índice promedio' : 'Tu índice', (equipo ? resumen.indicePromedio : filas[0]?.indice) ?? '—', 'violeta', '★')}
      </div>

      <div class="rejilla-graficas">
        <section class="panel">
          <header class="panel-cab"><h3>Distribución de tareas por colaborador</h3></header>
          ${this.graficaBarras(filas)}
        </section>
        <section class="panel">
          <header class="panel-cab"><h3>Tareas completadas por semana</h3><span class="muted mini">Últimas ${CONFIG.SEMANAS_TENDENCIA} semanas</span></header>
          ${this.graficaTendencia(Metricas.tendenciaSemanal(tareas, CONFIG.SEMANAS_TENDENCIA, hoy))}
        </section>
      </div>

      <section class="panel mt">
        <header class="panel-cab"><h3>Tabla de rendimiento</h3>
          <span class="muted mini" title="Cumplimiento = completadas ÷ (completadas + vencidas). Puntualidad = completadas a tiempo ÷ completadas con fecha límite.">ⓘ Índice = 50 % cumplimiento + 50 % puntualidad</span>
        </header>
        <div class="tabla-scroll"><table class="tabla tabla-rend">
          <thead><tr><th>Colaborador</th><th class="num">Tareas</th><th class="num">Completadas</th><th class="num">Cumplimiento</th><th class="num">Puntualidad</th>
            <th class="num">En curso</th><th class="num">Vencidas</th><th class="num">Días prom.</th><th>Índice</th></tr></thead>
          <tbody>${filas.map(f => {
            return `<tr class="fila-click" data-accion="ver-colaborador" data-id="${f.colaborador ? f.clave : ''}" title="Ver tareas de ${Util.esc(f.nombre)}">
              <td><span class="celda-colab">${UI.avatar(f.colaborador || { nombre: f.nombre }, 24)} ${Util.esc(f.nombre)}</span></td>
              <td class="num">${f.total}</td><td class="num">${f.completadas}</td>
              <td class="num">${pct(f.cumplimiento)}</td><td class="num">${pct(f.puntualidad)}</td>
              <td class="num">${f.enCurso}</td><td class="num ${f.vencidas ? 'txt-rojo' : ''}">${f.vencidas}</td>
              <td class="num">${f.diasPromedio === null ? '—' : f.diasPromedio.toFixed(1)}</td>
              <td>${UI.nivel(f.indice, { texto: true })}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="9" class="centrado muted pad">Sin datos en este periodo</td></tr>`}</tbody>
        </table></div>
      </section>`;
  },

  // Barras horizontales apiladas; la longitud es proporcional al total (escala común).
  graficaBarras(filas) {
    const conDatos = filas.filter(f => f.total > 0);
    if (!conDatos.length) return '<p class="muted pad">Sin tareas en este periodo.</p>';
    const max = Math.max(...conDatos.map(f => f.total));
    const leyenda = `<div class="leyenda">${this.SEGMENTOS.map(s => `<span class="leyenda-item"><span class="muestra" style="background:${s.color}"></span>${s.icono} ${s.label}</span>`).join('')}</div>`;
    const barras = conDatos.map(f => {
      const segs = this.SEGMENTOS.filter(s => f[s.clave] > 0).map(s => {
        const ancho = (f[s.clave] / max) * 100;
        const etiqueta = ancho >= 7 ? `<span class="seg-num">${f[s.clave]}</span>` : '';
        return `<span class="seg" style="width:${ancho}%;background:${s.color}" data-tip="${Util.esc(f.nombre)} · ${s.label}: ${f[s.clave]} de ${f.total}">${etiqueta}</span>`;
      }).join('');
      return `<div class="barra-fila">
        <span class="barra-nombre" title="${Util.esc(f.nombre)}">${Util.esc(f.nombre)}</span>
        <div class="barra-pista">${segs}</div>
        <span class="barra-total">${f.total}</span>
      </div>`;
    }).join('');
    return leyenda + `<div class="grafica-barras" role="img" aria-label="Distribución de tareas por colaborador; los valores exactos están en la tabla de rendimiento">${barras}</div>`;
  },

  // Línea de una sola serie con bandas de hover por semana.
  graficaTendencia(serie) {
    const W = 560, H = 210, I = 34, D = 14, A = 14, B = 28;
    const max = Math.max(4, ...serie.map(s => s.completadas));
    const tope = Math.ceil(max / 4) * 4;
    const x = i => I + (i * (W - I - D)) / Math.max(1, serie.length - 1);
    const y = v => A + (H - A - B) * (1 - v / tope);
    const ticks = [0, tope / 4, tope / 2, (3 * tope) / 4, tope];
    const puntos = serie.map((s, i) => `${x(i).toFixed(1)},${y(s.completadas).toFixed(1)}`).join(' ');
    const area = `${x(0)},${y(0)} ${puntos} ${x(serie.length - 1)},${y(0)}`;
    const paso = (W - I - D) / Math.max(1, serie.length - 1);
    const ult = serie[serie.length - 1];
    const fmtSem = iso => { const d = Util.deISO(iso); return d.getDate() + ' ' + Util.MESES_CORTOS[d.getMonth()]; };

    return `<svg class="grafica-linea" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tareas completadas por semana. Semana actual: ${ult.completadas}">
      ${ticks.map(t => `<line class="grid" x1="${I}" x2="${W - D}" y1="${y(t)}" y2="${y(t)}"/><text class="eje" x="${I - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
      ${serie.map((s, i) => i % 2 === serie.length % 2 ? '' : `<text class="eje" x="${x(i)}" y="${H - 8}" text-anchor="middle">${fmtSem(s.semana)}</text>`).join('')}
      <polygon class="area" points="${area}"/>
      <polyline class="linea" points="${puntos}"/>
      ${serie.map((s, i) => `<g class="banda" data-tip="Semana del ${fmtSem(s.semana)}: ${s.completadas} completada${s.completadas === 1 ? '' : 's'} (${s.aTiempo} a tiempo)">
        <rect x="${x(i) - paso / 2}" y="${A}" width="${paso}" height="${H - A - B}" fill="transparent"/>
        <line class="guia" x1="${x(i)}" x2="${x(i)}" y1="${A}" y2="${H - B}"/>
        <circle class="punto" cx="${x(i)}" cy="${y(s.completadas)}" r="4.5"/>
      </g>`).join('')}
      <text class="valor-final" x="${x(serie.length - 1) - 8}" y="${y(ult.completadas) - 10}" text-anchor="end">${ult.completadas}</text>
    </svg>`;
  },

  acciones: {
    periodo: el => { App.estado.rend.periodo = el.dataset.valor; App.render(); },
  },
};
