import { createOpportunity, guessPlatform } from '../core/opportunity.js';
import { upsertOpportunities } from '../storage/opportunities.js';
import { restrictStorage } from '../storage/settings.js';

function required(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Falta el elemento #${id} en popup.html.`);
  return node;
}
const el = required;

// Debe coincidir con los portales sin conector propio. Si algún día pasan a N1/N2,
// esta lista se vacía y no hay que tocar nada más.
const SIN_LECTURA_AUTOMATICA = new Set(['LinkedIn', 'Indeed', 'Upwork', 'Computrabajo']);
const SUFIJOS_CONOCIDOS = /^(linkedin|indeed|upwork|computrabajo|ashby|greenhouse|lever|infojobs)$/i;

function message(text, error = false) {
  const node = el('message');
  node.setAttribute('role', 'status');
  node.textContent = text;
  node.classList.toggle('error', error);
}

// "Backend Engineer | LinkedIn" → "Backend Engineer"
function limpiarTitulo(raw, platform) {
  const title = String(raw ?? '').trim();
  if (!title) return '';
  const partes = title.split(/\s+[|·—–]\s+/);
  if (partes.length < 2) return title;
  const ultima = partes[partes.length - 1].trim();
  if (ultima.toLowerCase() === platform.toLowerCase() || SUFIJOS_CONOCIDOS.test(ultima)) {
    return partes.slice(0, -1).join(' - ').trim();
  }
  return title;
}

async function init() {
  await restrictStorage();

  // activeTab permite leer solo el título y la URL al abrir el popup.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { message('No se pudo leer la pestaña activa.'); return; }
  if (!tab.url) { message('Sin acceso a esta pestaña. Vuelve a abrir el popup para conceder el permiso temporal.'); return; }
  if (!tab.url.startsWith('https://')) { message('Esta página no es HTTPS. Pega la URL manualmente; se rechazará cualquier otro esquema.'); return; }

  const platform = guessPlatform(tab.url);

  if (SIN_LECTURA_AUTOMATICA.has(platform)) {
    message(`Detectado en ${platform}. Como aún no hay conector declarado para este sitio, pega la URL y el título de la oferta.`);
    return;
  }

  el('url').value = tab.url;
  el('title').value = limpiarTitulo(tab.title, platform);
  message(`Precargado desde ${platform}. Revisa el cargo antes de guardar.`);
}

el('save-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = el('save-form').querySelector('button[type="submit"]');
  if (button?.disabled) return;
  if (button) button.disabled = true;

  try {
    const job = createOpportunity({
      url: el('url').value,
      title: el('title').value,
      company: el('company').value,
      sourceId: 'manual'
    });
    const result = await upsertOpportunities([job]);
    message(result.added ? 'Oportunidad guardada.' : 'Enlace ya existente: se conservó tu seguimiento.');
  } catch (error) {
    message(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
});

el('dashboard').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
  window.close();
});

init().catch((error) => message(`No fue posible iniciar: ${error.message}`, true));