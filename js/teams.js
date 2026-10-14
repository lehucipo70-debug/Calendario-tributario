// ═══════════════════════════════════════════════════════════════════
// NOTIFICACIONES A MICROSOFT TEAMS (opcional)
// Se configura en js/config.js. Sin URL configurada, no hace nada.
// ═══════════════════════════════════════════════════════════════════

const Teams = {
  urlPara(nombreColaborador) {
    const clave = Util.normalizar(nombreColaborador);
    for (const [nombre, url] of Object.entries(CONFIG.TEAMS_WEBHOOKS_POR_COLABORADOR)) {
      if (Util.normalizar(nombre) === clave) return url;
    }
    return CONFIG.TEAMS_WEBHOOK_URL;
  },

  async enviar(titulo, texto, nombreColaborador) {
    const url = Teams.urlPara(nombreColaborador);
    if (!url) return;
    const payload = {
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: titulo, weight: 'Bolder', size: 'Medium', wrap: true },
            { type: 'TextBlock', text: texto, wrap: true },
          ],
        },
      }],
    };
    try {
      await fetch(url, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch {
      // Algunos flujos de Power Automate bloquean CORS: se reintenta sin leer respuesta.
      try { await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) }); }
      catch (e) { console.warn('[Teams] No se pudo notificar:', e); }
    }
  },
};
