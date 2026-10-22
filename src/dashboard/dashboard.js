import { createOpportunity, validateImportedJob, isSupportedBackup, safeUrl, STATES, compactText } from '../core/opportunity.js';
import { calculateMatch, sanitizeSettings } from '../core/matching.js';
import { listOpportunities, upsertOpportunities, updateOpportunity, deleteOpportunity } from '../storage/opportunities.js';
import { loadSettings, saveSettings, restrictStorage } from '../storage/settings.js';
import { validateSource } from '../sources/adapters.js';
import { RETRY_FLOOR_MS } from '../core/pacing.js';

function required(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Falta el elemento #${id} en el HTML.`);
  return node;
}
const $ = required;

const PROVIDER_LABELS = { ashby: 'Ashby', greenhouse: 'Greenhouse' };

const state = { settings: null, jobs: [], editingId: null };
const statusNames = Object.fromEntries(STATES);

function feedback(message, error = false) {
  const node = $('notice');
  node.setAttribute('role', 'status');
  node.textContent = message;
  node.classList.toggle('error', error);
  node.classList.remove('hidden');
  node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function element(tag, classes = '', text = '') {
  const node = document.createElement(tag);
  if (classes) node.className = classes;
  node.textContent = text;
  return node;
}

function sources() {
  return state.settings?.sources ?? [];
}

function cooldownRemaining(source) {
  const floor = RETRY_FLOOR_MS[source.level || 'A0'];
  const last = source.lastAttemptAt ? Date.parse(source.lastAttemptAt) : 0;
  return Math.max(0, floor - (Date.now() - last));
}

function publicBoardUrl(source) {
  const board = encodeURIComponent(source.board);
  return source.provider === 'ashby'
    ? `https://jobs.ashbyhq.com/${board}`
    : `https://boards.greenhouse.io/${board}`;
}

async function runSourceSync(source) {
  const sourceId = source.id;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'SYNC_SOURCE', sourceId });
    state.settings = await loadSettings();
    const current = sources().find(item => item.id === sourceId);

    if (!response?.ok) {
      if (current && response?.throttle) {
        current.throttled = true;
        current.level = 'A0';
      }
      state.settings = await saveSettings(state.settings);
      const wait = response?.retryAfterMs ? ` Reintento sugerido en ${formatWait(response.retryAfterMs)}.` : '';
      throw new Error((response?.message || 'No hay respuesta del conector.') + wait);
    }

    const outcome = await upsertOpportunities(response.jobs);
    if (current) {
      current.lastCheckedAt = new Date().toISOString();
      if (response.level && response.level !== current.level) {
        current.level = response.level;
        current.throttled = response.level === 'A0' && current.throttled;
      }
    }
    state.settings = await saveSettings(state.settings);
    await reloadJobs();
    feedback(`Consulta finalizada: ${outcome.requested} ofertas válidas, ${outcome.added} nuevas.${response.truncated ? ' Atención: el tablero supera el límite de 200 ofertas; esta consulta es parcial.' : ''} No se postuló automáticamente.`);
  } catch (error) {
    state.settings = await loadSettings();
    feedback(error.message, true);
  } finally {
    renderSources();
  }
}

function formatWait(ms) {
  const minutes = Math.ceil(ms / 60_000);
  return minutes <= 1 ? 'menos de un minuto' : `${minutes} minutos`;
}

function navigate(section) {
  for (const name of ['opportunities', 'sources', 'preferences']) {
    $(`section-${name}`).classList.toggle('hidden', name !== section);
    document.querySelector(`[data-section="${name}"]`).classList.toggle('active', name === section);
  }
  $('notice').classList.add('hidden');
  $('page-title').textContent = { opportunities: 'Oportunidades', sources: 'Fuentes oficiales', preferences: 'Preferencias' }[section];
  if (section === 'sources') renderLog();
}

function renderStats() {
  $('stat-all').textContent = String(state.jobs.length);
  $('stat-new').textContent = String(state.jobs.filter(j => j.status === 'new').length);
  $('stat-saved').textContent = String(state.jobs.filter(j => j.status === 'saved').length);
  $('stat-applied').textContent = String(state.jobs.filter(j => j.status === 'applied' || j.status === 'interview').length);
}

function updatePlatformFilter() {
  const node = $('platform-filter');
  const previous = node.value;
  node.replaceChildren(new Option('Todas las plataformas', 'all'));
  const platforms = [...new Set(state.jobs.map(job => job.platform || 'Otro'))].sort();
  for (const platform of platforms) node.add(new Option(platform, platform));
  node.value = platforms.includes(previous) ? previous : 'all';
}

function filteredJobs() {
  const q = $('search').value.trim().toLocaleLowerCase();
  const status = $('status-filter').value;
  const platform = $('platform-filter').value;
  const minScore = state.settings.minScore;
  return state.jobs
    .map(job => ({ job, match: calculateMatch(job, state.settings) }))
    .filter(({ job, match }) =>
      (status === 'all' || job.status === status) &&
      (platform === 'all' || job.platform === platform) &&
      (!q || [job.title, job.company, job.location, job.description].join(' ').toLocaleLowerCase().includes(q)) &&
      (minScore === 0 || (match.score !== null && match.score >= minScore))
    )
    .sort((a, b) => $('sort').value === 'match'
      ? ((b.match.score ?? -1) - (a.match.score ?? -1) || b.job.createdAt.localeCompare(a.job.createdAt))
      : b.job.createdAt.localeCompare(a.job.createdAt));
}

function makeChip(text, extraClass = '') {
  return element('span', `chip ${extraClass}`, text);
}

function makeJobCard({ job, match }) {
  const card = element('article', 'job');
  const top = element('div', 'job-top');
  const left = element('div');
  left.append(element('div', 'job-company', job.company || 'Empresa no indicada'));
  left.append(element('h3', '', job.title));
  const sub = element('div', 'job-sub');
  sub.append(element('span', '', `⌖ ${job.location || 'Ubicación no indicada'}`));
  sub.append(element('span', '', `◷ Guardada ${new Date(job.createdAt).toLocaleDateString('es-CO')}`));
  left.append(sub);
  top.append(left);
  const score = element('div', 'job-score');
  score.append(element('strong', '', match.score === null ? '—' : `${match.score}%`));
  score.append(element('span', '', 'Afinidad estimada'));
  top.append(score);
  card.append(top);
  const chips = element('div', 'chips');
  chips.append(makeChip(statusNames[job.status] || 'Nueva', 'status'));
  if (job.platform) chips.append(makeChip(job.platform));
  if (job.remote === true) chips.append(makeChip('Remoto'));
  if (job.salaryText) chips.append(makeChip(job.salaryText));
  if (job.notes) chips.append(makeChip('Con nota'));
  card.append(chips);
  const bottom = element('div', 'job-bottom');
  bottom.append(element('p', '', match.reasons.length ? `Coincidencias: ${match.reasons.join(' · ')}` : 'Sin coincidencias verificadas'));
  const actions = element('div', 'job-buttons');
  const editButton = element('button', 'btn secondary', 'Seguimiento');
  editButton.type = 'button';
  editButton.addEventListener('click', () => editJob(job.id));
  const original = element('a', 'btn primary', 'Abrir oferta ↗');
  original.href = safeUrl(job.url)?.toString() || '#';
  original.target = '_blank';
  original.rel = 'noopener noreferrer';
  actions.append(editButton, original);
  bottom.append(actions);
  card.append(bottom);
  return card;
}

// Una sola ruta de render para evitar divergencias entre filtros y recarga.
function renderJobList(jobs, emptyTitle = 'Aún no hay oportunidades para mostrar', emptyText = 'Guarda tu primera oferta o ajusta los filtros para continuar.') {
  const target = $('jobs');
  target.replaceChildren();
  if (!jobs.length) {
    const empty = element('div', 'empty');
    empty.append(element('strong', '', emptyTitle));
    empty.append(element('p', '', emptyText));
    target.append(empty);
    return;
  }
  for (const record of jobs) target.append(makeJobCard(record));
}

function renderJobs() {
  renderStats();
  updatePlatformFilter();
  const jobs = filteredJobs();
  $('results-count').textContent = String(jobs.length);
  const empty = state.jobs.length
    ? ['Sin coincidencias', 'Cambia tus filtros o incorpora otra oportunidad.']
    : undefined;
  if (empty) renderJobList(jobs, ...empty);
  else renderJobList(jobs);
}

async function reloadJobs() {
  state.jobs = await listOpportunities();
  renderJobs();
}

function editJob(id) {
  const job = state.jobs.find(x => x.id === id);
  if (!job) return;
  state.editingId = id;
  $('edit-caption').textContent = `${job.title} · ${job.company || job.platform}`;
  $('edit-status').value = job.status;
  $('edit-notes').value = job.notes || '';
  $('edit-dialog').showModal();
}

async function addManual(event) {
  event.preventDefault();
  try {
    const newJob = createOpportunity({
      url: $('manual-url').value,
      title: $('manual-title').value,
      company: $('manual-company').value,
      location: $('manual-location').value
    });
    const result = await upsertOpportunities([newJob]);
    $('manual-form').reset();
    $('manual-form').classList.add('hidden');
    await reloadJobs();
    feedback(result.added ? 'Oportunidad incorporada.' : 'Este enlace ya estaba registrado. Se preservó el seguimiento.');
  } catch (error) { feedback(error.message, true); }
}

function hydratePreferences() {
  $('pref-roles').value = state.settings.roles.join(', ');
  $('pref-skills').value = state.settings.skills.join(', ');
  $('pref-location').value = state.settings.location;
  $('pref-salary').value = state.settings.expectedSalaryCop;
  $('pref-remote').checked = state.settings.remotePreferred;
  $('pref-score').value = String(state.settings.minScore);
}

async function renderAshbyAutoStatus() {
  const enabled = state.settings.autoScanAshby === true && Boolean(state.settings.autoScanAshbyPolicyReviewedAt);
  const permission = enabled && await chrome.permissions.contains({
    permissions: ['scripting'], origins: ['https://jobs.ashbyhq.com/*']
  }).catch(() => false);
  $('ashby-auto-status').textContent = permission
    ? `Activo solo para el tablero ${state.settings.autoScanAshbyBoard}: guarda enlaces y títulos visibles, sin consultar la red.`
    : 'El escáner está apagado. Ábrelo desde el popup en el listado del único tablero que quieras revisar.';
  $('ashby-auto-disable').hidden = !enabled;
}

async function submitPreferences(event) {
  event.preventDefault();
  state.settings = await saveSettings({
    ...state.settings,
    roles: $('pref-roles').value,
    skills: $('pref-skills').value,
    location: $('pref-location').value,
    expectedSalaryCop: $('pref-salary').value,
    remotePreferred: $('pref-remote').checked,
    minScore: Number($('pref-score').value)
  });
  hydratePreferences();
  renderJobs();
  feedback('Preferencias guardadas localmente.');
}

function sourceStatus(source) {
  if (!source.enabled) return source.policyReviewedAt ? 'Pausada' : 'Revisión pendiente';
  if (source.throttled) return 'Degradada a A0 por incidencias';
  return `Activa · nivel ${source.level || 'A0'}`;
}

function makeSourceCard(source) {
  const card = element('article', 'source-card');
  const info = element('div');
  info.append(element('h3', '', `${source.company} · ${PROVIDER_LABELS[source.provider] ?? source.provider}`));
  const detail = element('p', '', `Tablero: ${source.board} · ${sourceStatus(source)} · Último intento: ${source.lastAttemptAt ? new Date(source.lastAttemptAt).toLocaleString('es-CO') : 'ninguno'}`);
  info.append(detail);

  const wait = cooldownRemaining(source);
  if (source.enabled && wait > 0) {
    info.append(element('p', 'hint', `Siguiente consulta recomendada en ${formatWait(wait)}.`));
  }

  const actions = element('div', 'source-actions');

  const openBoard = element('button', 'btn secondary', 'Abrir tablero ↗');
  openBoard.type = 'button';
  openBoard.addEventListener('click', async () => {
    try { await chrome.tabs.create({ url: publicBoardUrl(source) }); }
    catch (error) { feedback(`No se pudo abrir el tablero: ${error.message}`, true); }
  });
  actions.append(openBoard);

  const sync = element('button', 'btn primary', 'Consultar ahora');
  sync.type = 'button';
  sync.disabled = !source.enabled || wait > 0;
  sync.addEventListener('click', async () => {
    sync.disabled = true;
    sync.textContent = 'Consultando…';
    await runSourceSync(source);
  });

  const toggle = element('button', 'btn secondary', source.enabled ? 'Pausar' : 'Habilitar');
  toggle.type = 'button';
  toggle.addEventListener('click', async () => {
    if (!source.enabled && !window.confirm('¿Confirmas que has revisado nuevamente las condiciones de acceso y tienes autorización para este uso?')) return;
    source.enabled = !source.enabled;
    if (source.enabled) {
      source.policyReviewedAt = new Date().toISOString();
      source.throttled = false;
      source.level = source.level || 'A0';
    }
    state.settings = await saveSettings(state.settings);
    renderSources();
  });

  const revoke = element('button', 'btn secondary', 'Revocar');
  revoke.type = 'button';
  revoke.addEventListener('click', async () => {
    if (!window.confirm('¿Revocar la autorización de esta fuente? Las oportunidades guardadas se conservan.')) return;
    state.settings.sources = sources().filter(x => x.id !== source.id);
    state.settings = await saveSettings(state.settings);
    renderSources();
    feedback('Autorización revocada. Las oportunidades guardadas permanecen.');
  });

  actions.append(sync, toggle, revoke);

  const owned = state.jobs.filter(job => job.sourceId === source.id).length;
  if (owned > 0) {
    const purge = element('button', 'btn danger', `Borrar ${owned} ofertas de esta fuente`);
    purge.type = 'button';
    purge.addEventListener('click', async () => {
      if (!window.confirm(`¿Eliminar las ${owned} oportunidades vinculadas a esta fuente?`)) return;
      for (const job of state.jobs.filter(j => j.sourceId === source.id)) {
        await deleteOpportunity(job.id);
      }
      await reloadJobs();
      renderSources();
      feedback('Datos de la fuente eliminados.');
    });
    actions.append(purge);
  }

  card.append(info, actions);
  return card;
}

function renderSources() {
  const container = $('sources-list');
  container.replaceChildren();
  if (!sources().length) {
    const empty = element('div', 'empty');
    empty.append(element('strong', '', 'No has conectado tableros'));
    empty.append(element('p', '', 'Comienza con el guardado manual. Añade APIs solo si el uso está permitido.'));
    container.append(empty);
    return;
  }
  for (const src of sources()) container.append(makeSourceCard(src));
}

async function addSource(event) {
  event.preventDefault();
  const confirmed = $('source-confirm').checked;
  const source = {
    id: crypto.randomUUID(),
    provider: $('source-provider').value,
    board: $('source-board').value.trim(),
    company: compactText($('source-company').value, 120),
    enabled: confirmed,
    policyReviewedAt: confirmed ? new Date().toISOString() : null,
    level: 'A0',
    cleanSessions: 0,
    throttled: false,
    session: false,
    lastAttemptAt: null,
    lastCheckedAt: null
  };
  try {
    validateSource(source);
    if (!source.company) throw new Error('Introduce el nombre del empleador.');
    if (!confirmed) throw new Error('Debes confirmar la revisión de condiciones antes de habilitar el tablero.');
    if (sources().length >= 30) throw new Error('Límite de 30 tableros alcanzado.');
    if (sources().some(s => s.provider === source.provider && s.board === source.board)) {
      throw new Error('Ya registraste este tablero.');
    }
    state.settings = await saveSettings({ ...state.settings, sources: [...sources(), source] });
    $('source-form').reset();
    renderSources();
    feedback('Tablero registrado. Las consultas API solo se ejecutan al pulsar «Consultar ahora».');
  } catch (error) { feedback(error.message, true); }
}

async function renderLog() {
  const container = document.getElementById('log-list');
  if (!container) return;
  container.replaceChildren();
  const stored = await chrome.storage.session.get('jobscout:log').catch(() => ({}));
  const entries = stored['jobscout:log'] ?? [];
  if (!entries.length) {
    container.append(element('p', '', 'Todavía no hay actividad registrada.'));
    return;
  }
  for (const entry of entries.slice(-40).reverse()) {
    const level = entry.level ? ` · nivel ${entry.level}` : '';
    const scan = entry.event === 'links-scanned'
      ? ` · ${entry.offers ?? 0} enlaces, ${entry.added ?? 0} nuevos${entry.truncated ? ' · lote parcial (máx. 200)' : ''}`
      : '';
    const line = element('p', 'log-line', `${entry.at} · ${entry.host} · ${entry.status ?? entry.event}${level}${scan}`);
    container.append(line);
  }
}

async function exportBackup() {
  try {
    const backup = {
      format: 'jobscout-backup', version: 1, exportedAt: new Date().toISOString(),
      settings: state.settings, opportunities: await listOpportunities()
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jobscout-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    feedback('Respaldo exportado. Protege el archivo: contiene datos de seguimiento.');
  } catch (error) { feedback(error.message, true); }
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error('El respaldo supera los 5 MB permitidos.');
    const data = JSON.parse(await file.text());
    if (!isSupportedBackup(data)) throw new Error('No es un respaldo JobScout v1 válido.');
    if (data.opportunities.length > 2000) throw new Error('El respaldo excede 2000 registros.');

    // Se valida el archivo completo antes de guardar cualquier oferta.
    const sanitized = data.opportunities.map((raw, index) => {
      try { return validateImportedJob(raw); }
      catch (error) { throw new Error(`registro ${index + 1}: ${error.message}`); }
    });

    for (let index = 0; index < sanitized.length; index += 400) {
      await upsertOpportunities(sanitized.slice(index, index + 400));
    }
    if (data.settings && typeof data.settings === 'object') {
      const imported = sanitizeSettings(data.settings);
      const inactiveSources = (imported.sources ?? []).map(src => ({
        ...src, enabled: false, policyReviewedAt: null, throttled: false, level: src.level || 'A0',
        lastAttemptAt: null
      }));
      state.settings = await saveSettings({
        ...imported, autoScanAshby: false, autoScanAshbyPolicyReviewedAt: null, sources: inactiveSources
      });
    }
    await chrome.runtime.sendMessage({ type: 'DISABLE_ASHBY_AUTO_SCAN' }).catch(() => null);
    state.settings = await loadSettings();
    hydratePreferences();
    renderSources();
    await renderAshbyAutoStatus();
    await reloadJobs();
    feedback(`${sanitized.length} oportunidades procesadas. Las fuentes importadas permanecen deshabilitadas.`);
  } catch (error) { feedback(`Importación rechazada: ${error.message}`, true); }
  finally { event.target.value = ''; }
}

async function start() {
  await restrictStorage();
  state.settings = await loadSettings();
  hydratePreferences();
  renderSources();
  await renderAshbyAutoStatus();
  await reloadJobs();
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === chrome.runtime.id && message?.type === 'OPPORTUNITIES_UPDATED') {
    void reloadJobs().catch(error => feedback(`No se pudo actualizar el dashboard: ${error.message}`, true));
  }
  return false;
});

for (const button of document.querySelectorAll('[data-section]')) {
  button.addEventListener('click', () => navigate(button.dataset.section));
}
$('show-add').addEventListener('click', () => $('manual-form').classList.remove('hidden'));
$('hide-add').addEventListener('click', () => $('manual-form').classList.add('hidden'));
$('manual-form').addEventListener('submit', addManual);
$('source-form').addEventListener('submit', addSource);
$('preferences-form').addEventListener('submit', submitPreferences);
$('ashby-auto-disable').addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'DISABLE_ASHBY_AUTO_SCAN' });
    if (!response?.ok) throw new Error(response?.message || 'No se pudo desactivar el escáner.');
    state.settings = await loadSettings();
    await renderAshbyAutoStatus();
    feedback('Escaneo desactivado. Las ofertas guardadas se conservan.');
  } catch (error) { feedback(error.message, true); }
});

for (const id of ['search', 'status-filter', 'platform-filter', 'sort']) {
  $(id).addEventListener(id === 'search' ? 'input' : 'change', () => {
    // No reconstruimos plataformas al filtrar para preservar la selección.
    const results = filteredJobs();
    $('results-count').textContent = String(results.length);
    if (state.jobs.length) renderJobList(results, 'Sin coincidencias', 'Cambia tus filtros o incorpora otra oportunidad.');
    else renderJobList(results);
  });
}

$('edit-close').addEventListener('click', () => $('edit-dialog').close());
$('edit-save').addEventListener('click', async () => {
  if (!state.editingId) return;
  try {
    await updateOpportunity(state.editingId, { status: $('edit-status').value, notes: $('edit-notes').value });
    $('edit-dialog').close();
    await reloadJobs();
    feedback('Seguimiento actualizado.');
  } catch (error) { feedback(error.message, true); }
});
$('edit-delete').addEventListener('click', async () => {
  if (!state.editingId || !window.confirm('¿Eliminar esta oportunidad de forma permanente?')) return;
  await deleteOpportunity(state.editingId);
  $('edit-dialog').close();
  await reloadJobs();
  feedback('Oportunidad eliminada.');
});
$('export').addEventListener('click', exportBackup);
$('import').addEventListener('change', importBackup);
start().catch(error => feedback(`Error de inicio: ${error.message}`, true));
