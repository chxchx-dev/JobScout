import { createOpportunity, guessPlatform } from '../core/opportunity.js';
import { upsertOpportunities } from '../storage/opportunities.js';
import { loadSettings, restrictStorage } from '../storage/settings.js';
import { ashbyBoardFromUrl } from '../sources/ashby-dom.js';

const ASHBY_PERMISSION = 'https://jobs.ashbyhq.com/*';
let activeTab;

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
  el('save-form').hidden = false;

  // activeTab permite leer solo el título y la URL al abrir el popup.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  if (!tab) { message('No se pudo leer la pestaña activa.'); return; }
  if (!tab.url) { message('Sin acceso a esta pestaña. Vuelve a abrir el popup para conceder el permiso temporal.'); return; }
  if (!tab.url.startsWith('https://')) { message('Esta página no es HTTPS. Pega la URL manualmente; se rechazará cualquier otro esquema.'); return; }

  const platform = guessPlatform(tab.url);

  if (platform === 'Ashby') {
    const page = ashbyBoardFromUrl(tab.url);
    el('hero-title').textContent = 'Detectar enlaces de vacantes';
    el('hero-description').textContent = 'Lee el enlace y el título visible de este tablero Ashby. No consulta APIs ni guarda descripciones.';
    el('save-form').hidden = true;
    el('ashby-scan').hidden = false;

    const settings = await loadSettings();
    const hasPermission = await chrome.permissions.contains({
      permissions: ['scripting'], origins: [ASHBY_PERMISSION]
    });
    const enabled = settings.autoScanAshby === true && Boolean(settings.autoScanAshbyPolicyReviewedAt) && hasPermission;
    const sameBoard = enabled && settings.autoScanAshbyBoard === page?.board;
    const canEnable = page?.pageType === 'board';
    el('ashby-consent-row').hidden = !canEnable || sameBoard;
    el('ashby-enable').hidden = !canEnable || sameBoard;
    el('ashby-enable').textContent = enabled ? 'Cambiar tablero autorizado' : 'Autorizar este tablero';
    el('ashby-disable').hidden = !enabled;

    if (!page) {
      message('Abre un tablero Ashby público para detectar sus enlaces de vacantes.', true);
    } else if (sameBoard) {
      message(`Escaneo activo para ${page.board}. Solo se guardan URL y título del enlace.`);
    } else if (enabled) {
      message(`El escaneo está limitado a ${settings.autoScanAshbyBoard}. Para revisar ${page.board}, autorízalo como el único tablero activo.`);
    } else if (!canEnable) {
      message(`Abre el listado https://jobs.ashbyhq.com/${page.board} para activar el escaneo.`);
    } else {
      message('Actívalo una vez en el listado autorizado. JobScout guardará solo enlaces y títulos en este perfil local.');
    }
    return;
  }

  if (SIN_LECTURA_AUTOMATICA.has(platform)) {
    el('save-form').hidden = false;
    message(`Detectado en ${platform}. Como aún no hay conector declarado para este sitio, pega la URL y el título de la oferta.`);
    return;
  }

  el('save-form').hidden = false;
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

el('ashby-enable').addEventListener('click', async () => {
  if (!activeTab?.id) { message('No se pudo identificar la pestaña Ashby.', true); return; }
  const page = ashbyBoardFromUrl(activeTab.url);
  if (!page || page.pageType !== 'board') {
    message('Abre el listado del tablero Ashby antes de activarlo.', true);
    return;
  }
  if (!el('ashby-consent').checked) {
    message('Confirma primero que revisaste las condiciones de este tablero y puedes guardar sus enlaces localmente.', true);
    return;
  }

  const button = el('ashby-enable');
  button.disabled = true;
  try {
    // Esta solicitud ocurre directamente tras la acción del usuario.
    const granted = await chrome.permissions.request({ permissions: ['scripting'], origins: [ASHBY_PERMISSION] });
    if (!granted) throw new Error('No se concedió el permiso opcional para jobs.ashbyhq.com.');
    const response = await chrome.runtime.sendMessage({
      type: 'ENABLE_ASHBY_AUTO_SCAN', tabId: activeTab.id, board: page.board, policyConfirmed: true
    });
    if (!response?.ok) throw new Error(response?.message || 'No se pudo activar el escaneo.');
    el('ashby-consent-row').hidden = true;
    button.hidden = true;
    el('ashby-disable').hidden = false;
    message(`Escaneo activo para ${page.board}. Se guardarán únicamente URL y título; abre el dashboard para verlos.`);
  } catch (error) {
    message(error.message, true);
  } finally {
    button.disabled = false;
  }
});

el('ashby-disable').addEventListener('click', async () => {
  const button = el('ashby-disable');
  button.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'DISABLE_ASHBY_AUTO_SCAN' });
    if (!response?.ok) throw new Error(response?.message || 'No se pudo desactivar el escaneo.');
    el('ashby-consent-row').hidden = false;
    el('ashby-enable').hidden = false;
    button.hidden = true;
    el('ashby-consent').checked = false;
    message('Escaneo desactivado y permiso de Ashby revocado. Los enlaces guardados se conservan.');
  } catch (error) {
    message(error.message, true);
  } finally {
    button.disabled = false;
  }
});

el('dashboard').addEventListener('click', async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
  window.close();
});

init().catch((error) => message(`No fue posible iniciar: ${error.message}`, true));
