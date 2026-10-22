export const STATES = Object.freeze([
  ['new', 'Nueva'], ['saved', 'Guardada'], ['applied', 'Postulada'],
  ['interview', 'Entrevista'], ['rejected', 'Descartada'], ['archived', 'Archivada']
]);

const STATE_IDS = new Set(STATES.map(([id]) => id));

export function isState(value) {
  return STATE_IDS.has(value);
}

// Recorta sin partir pares sustitutos (emoji fuera del rango válido).
function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

// Sin DOM: limpieza por expresión regular. Solo reconoce etiquetas reales,
// para no comerse un "<" suelto como el de "$50.000 < 60.000".
function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[a-zA-Z/!][^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'");
}

export function compactText(value, max = 240) {
  return truncate(String(value ?? '').replace(/\s+/g, ' ').trim(), max);
}

// Campos que llegan de fuentes externas: se limpian antes de compactar.
export function plainText(value, max = 240) {
  return compactText(stripHtml(value), max);
}

// Solo guardamos enlaces web seguros; nunca javascript:, file:, data: ni URLs con credenciales.
export function safeUrl(raw) {
  try {
    const url = new URL(String(raw ?? '').trim());
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function canonicalUrl(raw) {
  const url = safeUrl(raw);
  if (!url) return null;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

function hostMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

export function guessPlatform(raw) {
  const host = safeUrl(raw)?.hostname.toLowerCase() ?? '';
  if (hostMatches(host, 'linkedin.com')) return 'LinkedIn';
  if (hostMatches(host, 'indeed.com')) return 'Indeed';
  if (hostMatches(host, 'upwork.com')) return 'Upwork';
  if (hostMatches(host, 'computrabajo.com')) return 'Computrabajo';
  if (host === 'jobs.ashbyhq.com') return 'Ashby';
  if (hostMatches(host, 'greenhouse.io')) return 'Greenhouse';
  if (host === 'jobs.lever.co') return 'Lever';
  return host.replace(/^www\./, '') || 'Otro sitio';
}

export function createOpportunity(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Formato de oportunidad inválido.');
  const url = canonicalUrl(raw.url);
  if (!url) throw new Error('La oportunidad necesita una URL HTTPS válida.');
  const title = plainText(raw.title, 180);
  if (!title) throw new Error('La oportunidad necesita un cargo o título.');
  const now = new Date().toISOString();
  const postedAt = raw.postedAt && Number.isFinite(Date.parse(raw.postedAt))
    ? new Date(raw.postedAt).toISOString() : null;
  return {
    id: `url:${url}`,
    url,
    title,
    company: plainText(raw.company, 120),
    location: plainText(raw.location, 140),
    description: plainText(raw.description, 2500),
    salaryText: plainText(raw.salaryText, 140),
    remote: raw.remote === true ? true : raw.remote === false ? false : null,
    platform: compactText(raw.platform || guessPlatform(url), 100),
    sourceId: compactText(raw.sourceId || 'manual', 150),
    postedAt,
    createdAt: now,
    lastSeenAt: now,
    status: 'new',
    notes: ''
  };
}

export function validateImportedJob(raw) {
  const job = createOpportunity(raw);
  job.status = isState(raw.status) ? raw.status : 'new';
  job.notes = String(raw.notes ?? '').slice(0, 4000);
  if (raw.createdAt && Number.isFinite(Date.parse(raw.createdAt))) {
    job.createdAt = new Date(raw.createdAt).toISOString();
  }
  if (raw.lastSeenAt && Number.isFinite(Date.parse(raw.lastSeenAt))) {
    job.lastSeenAt = new Date(raw.lastSeenAt).toISOString();
  }
  return job;
}

export function isSupportedBackup(data) {
  return data?.version === 1 && (
    data.format === 'jobscout-backup' ||
    data.format === 'rolenexa-backup' // Legacy backup name remains importable after the rebrand.
  ) && Array.isArray(data.opportunities);
}