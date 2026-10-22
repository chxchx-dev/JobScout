import { loadSettings, saveSettings, restrictStorage } from '../storage/settings.js';
import { fetchBoard, sourceEndpoint } from '../sources/adapters.js';
import {
  RETRY_FLOOR_MS, budgetPerMinute, delayMs, backoffMs,
  nextLevel, openCircuit, reduceOutcome
} from '../core/pacing.js';

const LOG_KEY = 'jobscout:log';
const WINDOW_KEY = 'jobscout:window';
const FAILURE_KEY = 'jobscout:failures';
const PREVIOUS_ATTEMPTS = 'jobscoutAttemptTimes';
const LEGACY_ATTEMPTS = 'rolenexaAttemptTimes';

const MAX_ATTEMPTS = 3;
const LOG_LIMIT = 200;
const WINDOW_MS = 60_000;

const running = new Set();
const rng = Math.random;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Se aplica en cada despertar del worker, no solo en install/startup.
restrictStorage().catch(console.error);
chrome.runtime.onInstalled.addListener(() => { migrate().catch(console.error); });
chrome.runtime.onStartup.addListener(() => { migrate().catch(console.error); });

// --- Utilidades ---------------------------------------------------------

function hostOf(source) {
  return new URL(sourceEndpoint(source)).hostname;
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

// --- Flujo principal ----------------------------------------------------

async function sync(sourceId) {
  if (!sourceId) throw new Error('Falta el identificador de la fuente.');
  if (running.has(sourceId)) throw new Error('Ya hay una consulta en curso para este tablero.');

  const settings = await loadSettings();
  const source = (settings.sources ?? []).find((item) => item.id === sourceId);
  if (!source) throw new Error('Fuente no encontrada.');
  if (!source.enabled) throw new Error('La fuente está pausada.');
  if (!source.policyReviewedAt) throw new Error('La fuente no tiene la revisión de condiciones registrada.');

  const level = source.level || 'A0';
  const last = source.lastAttemptAt ? Date.parse(source.lastAttemptAt) : 0;
  const remaining = Math.max(0, RETRY_FLOOR_MS[level] - (Date.now() - last));
  if (remaining > 0) {
    const error = new Error(`Siguiente consulta recomendada en ${Math.ceil(remaining / 60_000)} min.`);
    error.retryAfterMs = remaining;
    error.level = level;
    throw error;
  }

  running.add(sourceId);
  try {
    source.lastAttemptAt = new Date().toISOString();
    await saveSettings(settings);

    const host = hostOf(source);
    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
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
  }
}

// --- Mensajería ---------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'SYNC_SOURCE') return false;

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