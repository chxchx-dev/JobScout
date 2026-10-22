import { loadSettings, saveSettings, restrictStorage } from '../storage/settings.js';
import { fetchBoard, sourceEndpoint } from '../sources/adapters.js';
import { ashbyBoardFromUrl, parseAshbyLinks } from '../sources/ashby-dom.js';
import { createOpportunity } from '../core/opportunity.js';
import { upsertOpportunities } from '../storage/opportunities.js';
import {
  RETRY_FLOOR_MS, budgetPerMinute, delayMs, backoffMs,
  nextLevel, openCircuit, reduceOutcome
} from '../core/pacing.js';

const LOG_KEY = 'jobscout:log';
const WINDOW_KEY = 'jobscout:window';
const DAILY_KEY = 'jobscout:daily-requests';
const FAILURE_KEY = 'jobscout:failures';
const PREVIOUS_ATTEMPTS = 'jobscoutAttemptTimes';
const LEGACY_ATTEMPTS = 'rolenexaAttemptTimes';

const MAX_ATTEMPTS = 3;
const LOG_LIMIT = 200;
const WINDOW_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;
const DAILY_REQUEST_LIMIT = 4;
const ASHBY_HOST = 'jobs.ashbyhq.com';
const ASHBY_ORIGIN = 'https://jobs.ashbyhq.com/*';
const ASHBY_SCRIPT_ID = 'jobscout-ashby-dom-scanner';

const running = new Set();
const runningHosts = new Set();
const rng = Math.random;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Se aplica en cada despertar del worker, no solo en install/startup.
restrictStorage().catch(console.error);
chrome.runtime.onInstalled.addListener(() => {
  migrate().then(reconcileAshbyContentScript).catch(console.error);
});
chrome.runtime.onStartup.addListener(() => {
  migrate().then(reconcileAshbyContentScript).catch(console.error);
});

// --- Utilidades ---------------------------------------------------------

function hostOf(source) {
  return new URL(sourceEndpoint(source)).hostname;
}

function ashbySender(sender) {
  try {
    return sender.id === chrome.runtime.id && sender.frameId === 0 && Number.isInteger(sender.tab?.id) &&
      new URL(sender.url).protocol === 'https:' && new URL(sender.url).hostname === ASHBY_HOST &&
      Boolean(ashbyBoardFromUrl(sender.url));
  } catch {
    return false;
  }
}

function extensionPageSender(sender) {
  return sender.id === chrome.runtime.id && typeof sender.url === 'string' &&
    sender.url.startsWith(chrome.runtime.getURL(''));
}

async function hasAshbyPermissions() {
  return chrome.permissions.contains({
    permissions: ['scripting'],
    origins: [ASHBY_ORIGIN]
  });
}

async function unregisterAshbyContentScript() {
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [ASHBY_SCRIPT_ID] }).catch(() => []);
  if (registered.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [ASHBY_SCRIPT_ID] }).catch(() => {});
  }
}

async function stopAshbyContentScripts(board = null) {
  const tabs = await chrome.tabs.query({ url: ASHBY_ORIGIN }).catch(() => []);
  await Promise.all(tabs.filter((tab) => Number.isInteger(tab.id) &&
    (!board || ashbyBoardFromUrl(tab.url ?? '')?.board === board)
  ).map((tab) =>
    chrome.tabs.sendMessage(tab.id, { type: 'ASHBY_SCAN_STOP' }).catch(() => {})
  ));
}

async function registerAshbyContentScript(board) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(board ?? ''))) {
    throw new Error('El identificador del tablero Ashby no es válido.');
  }
  if (!(await hasAshbyPermissions())) throw new Error('Chrome no concedió el permiso de Ashby.');
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [ASHBY_SCRIPT_ID] });
  const matches = [
    `https://jobs.ashbyhq.com/${board}`,
    `https://jobs.ashbyhq.com/${board}/`,
    `https://jobs.ashbyhq.com/${board}/*`
  ];
  const registeredMatches = registered[0]?.matches ?? [];
  if (registered.length && JSON.stringify(registeredMatches) === JSON.stringify(matches)) return;
  if (registered.length) await unregisterAshbyContentScript();
  await chrome.scripting.registerContentScripts([{
    id: ASHBY_SCRIPT_ID,
    matches,
    js: ['src/content/ashby.js'],
    runAt: 'document_idle',
    persistAcrossSessions: true
  }]);
}

async function reconcileAshbyContentScript() {
  const settings = await loadSettings();
  const enabled = settings.autoScanAshby === true && Boolean(settings.autoScanAshbyPolicyReviewedAt) &&
    Boolean(settings.autoScanAshbyBoard);
  const permission = enabled && await hasAshbyPermissions().catch(() => false);
  if (permission) {
    await registerAshbyContentScript(settings.autoScanAshbyBoard);
  } else {
    await stopAshbyContentScripts();
    await unregisterAshbyContentScript();
    if (settings.autoScanAshby || await hasAshbyPermissions().catch(() => false)) {
      await chrome.permissions.remove({ permissions: ['scripting'], origins: [ASHBY_ORIGIN] }).catch(() => false);
    }
  }
}

async function enableAshbyAutoScan(tabId, board, policyConfirmed) {
  if (policyConfirmed !== true || !Number.isInteger(tabId)) {
    throw new Error('Confirma la revisión de condiciones desde el tablero Ashby.');
  }
  const tab = await chrome.tabs.get(tabId);
  const page = ashbyBoardFromUrl(tab.url ?? '');
  if (!page || page.pageType !== 'board' || page.board !== board) {
    throw new Error('Activa el escaneo desde el listado del tablero Ashby que quieres revisar.');
  }
  const settings = await loadSettings();
  if (settings.autoScanAshbyBoard && settings.autoScanAshbyBoard !== page.board) {
    await stopAshbyContentScripts(settings.autoScanAshbyBoard);
  }
  await registerAshbyContentScript(page.board);

  settings.autoScanAshby = true;
  settings.autoScanAshbyBoard = page.board;
  settings.autoScanAshbyPolicyReviewedAt = new Date().toISOString();
  await saveSettings(settings);

  // El script dinámico cubre páginas futuras; esta inserción procesa la pestaña actual.
  await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/ashby.js'] });
  await chrome.tabs.sendMessage(tabId, { type: 'ASHBY_SCAN_NOW' }).catch(() => {});
  return { enabled: true, board: page.board };
}

async function disableAshbyAutoScan() {
  const settings = await loadSettings();
  settings.autoScanAshby = false;
  settings.autoScanAshbyBoard = null;
  settings.autoScanAshbyPolicyReviewedAt = null;
  await saveSettings(settings);

  await stopAshbyContentScripts();
  await unregisterAshbyContentScript();
  await chrome.permissions.remove({ permissions: ['scripting'], origins: [ASHBY_ORIGIN] }).catch(() => false);
  return { enabled: false };
}

async function ashbyScanReady(sender, message) {
  if (!ashbySender(sender) || message.visible !== true) return { scan: false };
  const page = ashbyBoardFromUrl(sender.url);
  const settings = await loadSettings();
  return {
    scan: settings.autoScanAshby === true && Boolean(settings.autoScanAshbyPolicyReviewedAt) &&
      settings.autoScanAshbyBoard === page?.board && message.board === page?.board &&
      await hasAshbyPermissions()
  };
}

async function saveAshbyScan(sender, message) {
  if (!ashbySender(sender) || message.payload?.visible !== true) {
    return { ok: false, message: 'La pestaña debe estar visible y pertenecer al tablero Ashby autorizado.' };
  }
  const settings = await loadSettings();
  if (!settings.autoScanAshby || !settings.autoScanAshbyPolicyReviewedAt || !(await hasAshbyPermissions())) {
    return { ok: false, message: 'El escaneo automático está desactivado.' };
  }

  const page = ashbyBoardFromUrl(sender.url);
  if (!page || page.board !== settings.autoScanAshbyBoard || message.payload?.board !== page.board) {
    return { ok: false, message: 'El listado no coincide con el único tablero Ashby autorizado.' };
  }

  const jobs = parseAshbyLinks({ board: page.board, pageUrl: sender.url, links: message.payload.links });
  const truncated = message.payload.truncated === true;
  if (!jobs.length) {
    await appendLog({ host: ASHBY_HOST, event: 'links-scanned', offers: 0, added: 0, truncated });
    return { ok: true, added: 0, scanned: 0, truncated };
  }
  const result = await upsertOpportunities(jobs.map(createOpportunity));
  await appendLog({ host: ASHBY_HOST, event: 'links-scanned', offers: jobs.length, added: result.added, truncated });
  chrome.runtime.sendMessage({ type: 'OPPORTUNITIES_UPDATED' }).catch(() => {});
  return {
    ok: true,
    added: result.added,
    scanned: jobs.length,
    truncated
  };
}

async function appendLog(entry) {
  const stored = await chrome.storage.session.get(LOG_KEY).catch(() => ({}));
  const entries = stored[LOG_KEY] ?? [];
  entries.push({ at: new Date().toISOString(), ...entry });
  await chrome.storage.session.set({ [LOG_KEY]: entries.slice(-LOG_LIMIT) }).catch(() => {});
}

async function loadFailures() {
  const stored = await chrome.storage.session.get(FAILURE_KEY).catch(() => ({}));
  return stored[FAILURE_KEY] ?? {};
}

async function saveFailures(domains) {
  await chrome.storage.session.set({ [FAILURE_KEY]: domains }).catch(() => {});
}

function pacerState(source, failures) {
  return {
    level: source.level || 'A0',
    cleanSessions: source.cleanSessions ?? 0,
    throttled: source.throttled === true,
    domains: failures
  };
}

async function applyState(source, settings, next) {
  const promoted = nextLevel({ level: next.level, cleanSessions: next.cleanSessions });
  source.level = promoted;
  source.cleanSessions = promoted === next.level ? next.cleanSessions : 0;
  source.throttled = next.throttled;
  await saveFailures(next.domains);
  await saveSettings(settings);
  return promoted;
}

// Migra las marcas de tiempo del formato antiguo al campo de la fuente.
async function migrate() {
  const stored = await chrome.storage.local.get([PREVIOUS_ATTEMPTS, LEGACY_ATTEMPTS]);
  const map = stored[PREVIOUS_ATTEMPTS] ?? stored[LEGACY_ATTEMPTS];
  if (map === undefined) return;
  const settings = await loadSettings();
  let touched = false;
  for (const source of settings.sources ?? []) {
    const stamp = Number(map[source.id] || 0);
    if (!source.lastAttemptAt && stamp > 0) {
      source.lastAttemptAt = new Date(stamp).toISOString();
      touched = true;
    }
  }
  if (touched) await saveSettings(settings);
  await chrome.storage.local.remove([PREVIOUS_ATTEMPTS, LEGACY_ATTEMPTS]);
}

// --- Ritmo --------------------------------------------------------------

// Ventana deslizante por host: nunca se supera el presupuesto del nivel.
async function pace(host, level) {
  const budget = budgetPerMinute(level);
  const stored = await chrome.storage.session.get(WINDOW_KEY).catch(() => ({}));
  const windows = stored[WINDOW_KEY] ?? {};
  const now = Date.now();
  const recent = (windows[host] ?? []).filter((stamp) => now - stamp < WINDOW_MS);

  let wait = delayMs(level, rng);
  if (recent.length >= budget) {
    wait = Math.max(wait, WINDOW_MS - (now - recent[0]) + delayMs(level, rng));
  }
  await sleep(wait);

  recent.push(Date.now());
  windows[host] = recent;
  await chrome.storage.session.set({ [WINDOW_KEY]: windows }).catch(() => {});
  return wait;
}

async function reserveDailyRequest(host) {
  const stored = await chrome.storage.local.get(DAILY_KEY);
  const history = stored[DAILY_KEY] && typeof stored[DAILY_KEY] === 'object' && !Array.isArray(stored[DAILY_KEY])
    ? stored[DAILY_KEY] : {};
  const now = Date.now();
  const recent = (Array.isArray(history[host]) ? history[host] : []).filter((stamp) =>
    Number.isSafeInteger(stamp) && stamp > now - DAY_MS && stamp <= now
  );
  if (recent.length >= DAILY_REQUEST_LIMIT) {
    const retryAfterMs = Math.max(0, DAY_MS - (now - recent[0]));
    const error = new Error(`Se alcanzó el límite de ${DAILY_REQUEST_LIMIT} consultas por host cada 24 horas.`);
    error.retryAfterMs = retryAfterMs;
    error.kind = 'daily-budget';
    throw error;
  }

  recent.push(now);
  history[host] = recent;
  await chrome.storage.local.set({ [DAILY_KEY]: history });
}

// --- Flujo principal ----------------------------------------------------

async function sync(sourceId) {
  if (!sourceId) throw new Error('Falta el identificador de la fuente.');
  if (running.has(sourceId)) throw new Error('Ya hay una consulta en curso para este tablero.');
  running.add(sourceId);
  let lockedHost = '';

  try {
    const settings = await loadSettings();
    const source = (settings.sources ?? []).find((item) => item.id === sourceId);
    if (!source) throw new Error('Fuente no encontrada.');
    if (!source.enabled) throw new Error('La fuente está pausada.');
    if (!source.policyReviewedAt) throw new Error('La fuente no tiene la revisión de condiciones registrada.');

    const host = hostOf(source);
    if (runningHosts.has(host)) throw new Error('Ya hay una consulta en curso para este dominio.');
    runningHosts.add(host);
    lockedHost = host;

    const level = source.level || 'A0';
    const last = source.lastAttemptAt ? Date.parse(source.lastAttemptAt) : 0;
    const remaining = Math.max(0, RETRY_FLOOR_MS[level] - (Date.now() - last));
    if (remaining > 0) {
      const error = new Error(`Siguiente consulta recomendada en ${Math.ceil(remaining / 60_000)} min.`);
      error.retryAfterMs = remaining;
      error.level = level;
      throw error;
    }

    source.lastAttemptAt = new Date().toISOString();
    await saveSettings(settings);

    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      await reserveDailyRequest(host);
      await pace(host, source.level || 'A0');

      try {
        const result = await fetchBoard(source);

        const failures = await loadFailures();
        const next = reduceOutcome(pacerState(source, failures), { host, status: 200 });
        const promoted = await applyState(source, settings, next);

        source.lastCheckedAt = new Date().toISOString();
        await saveSettings(settings);
        await appendLog({ host, status: 200, level: promoted, event: 'ok', offers: result.jobs.length });

        return { ...result, sourceId, level: promoted };
      } catch (error) {
        const status = error.status ?? 0;

        if (error.throttle) {
          const failures = await loadFailures();
          const next = reduceOutcome(pacerState(source, failures), { host, status });
          await applyState(source, settings, next);
          const retryAfterMs = backoffMs(1, rng);
          await appendLog({ host, status, level: source.level, event: 'throttle' });
          error.retryAfterMs = retryAfterMs;
          error.level = source.level;
          throw error;
        }

        const lastAttempt = attempt >= MAX_ATTEMPTS;
        if (!error.retryable || lastAttempt) {
          const failures = await loadFailures();
          const next = reduceOutcome(pacerState(source, failures), { host, status });
          await applyState(source, settings, next);
          const failuresNow = next.domains[host]?.failures ?? 0;
          error.retryAfterMs = openCircuit(failuresNow) ? backoffMs(failuresNow, rng) : null;
          await appendLog({ host, status, level: source.level, event: 'error' });
          throw error;
        }

        await sleep(backoffMs(attempt, rng));
      }
    }

    throw new Error('Sin resultado tras agotar los intentos.');
  } finally {
    running.delete(sourceId);
    if (lockedHost) runningHosts.delete(lockedHost);
  }
}

// --- Mensajería ---------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;

  if (message?.type === 'ASHBY_SCAN_READY') {
    ashbyScanReady(sender, message).then(respond).catch(() => respond({ scan: false }));
    return true;
  }

  if (message?.type === 'ASHBY_LINKS_RESULT') {
    saveAshbyScan(sender, message).then(respond).catch((error) => respond({ ok: false, message: error.message }));
    return true;
  }

  if (message?.type === 'ENABLE_ASHBY_AUTO_SCAN') {
    if (!extensionPageSender(sender)) return false;
    enableAshbyAutoScan(Number(message.tabId), String(message.board ?? ''), message.policyConfirmed)
      .then((payload) => respond({ ok: true, ...payload }))
      .catch((error) => respond({ ok: false, message: error.message }));
    return true;
  }

  if (message?.type === 'DISABLE_ASHBY_AUTO_SCAN') {
    if (!extensionPageSender(sender)) return false;
    disableAshbyAutoScan()
      .then((payload) => respond({ ok: true, ...payload }))
      .catch((error) => respond({ ok: false, message: error.message }));
    return true;
  }

  if (message?.type !== 'SYNC_SOURCE') return false;
  if (!extensionPageSender(sender)) return false;

  sync(String(message.sourceId ?? ''))
    .then((payload) => respond({ ok: true, ...payload }))
    .catch((error) => respond({
      ok: false,
      message: error.message,
      throttle: error.throttle === true,
      retryable: error.retryable === true,
      retryAfterMs: error.retryAfterMs ?? null,
      level: error.level ?? null
    }));

  return true;
});
