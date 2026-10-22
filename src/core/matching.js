import { compactText } from './opportunity.js';

export const DEFAULT_SETTINGS = Object.freeze({
  roles: ['software engineer', 'backend developer', 'software architect'],
  skills: ['javascript', 'python', '.net', 'postgresql'],
  location: 'Colombia',
  remotePreferred: true,
  expectedSalaryCop: '',
  minScore: 0,
  sources: []
});

export function termsFrom(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(values.map(x => compactText(x, 60).toLowerCase()).filter(Boolean))].slice(0, 35);
}

export function sanitizeSettings(raw = {}) {
  return {
    roles: termsFrom(raw.roles ?? DEFAULT_SETTINGS.roles),
    skills: termsFrom(raw.skills ?? DEFAULT_SETTINGS.skills),
    location: compactText(raw.location ?? DEFAULT_SETTINGS.location, 120),
    remotePreferred: raw.remotePreferred === true,
    expectedSalaryCop: /^[0-9]{0,12}$/.test(String(raw.expectedSalaryCop ?? '')) ? String(raw.expectedSalaryCop ?? '') : '',
    minScore: Math.min(100, Math.max(0, Number(raw.minScore) || 0)),
    sources: Array.isArray(raw.sources) ? raw.sources.slice(0, 30)
      .filter(x => x && typeof x === 'object' && ['ashby', 'greenhouse'].includes(x.provider) && /^[A-Za-z0-9_-]{1,80}$/.test(x.board ?? ''))
      .map(x => ({
        id: /^[a-zA-Z0-9-]{1,80}$/.test(String(x.id ?? '')) ? String(x.id) : 'invalid',
        provider: x.provider,
        board: x.board,
        company: compactText(x.company, 120),
        enabled: x.enabled === true && Boolean(x.policyReviewedAt),
        policyReviewedAt: typeof x.policyReviewedAt === 'string' ? x.policyReviewedAt.slice(0, 32) : null,
        lastCheckedAt: typeof x.lastCheckedAt === 'string' ? x.lastCheckedAt.slice(0, 32) : null
      })) : []
  };
}

function normalized(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Puntuación auditable: solo evaluamos criterios disponibles. No inferimos salarios.
export function calculateMatch(job, settings) {
  const cfg = sanitizeSettings(settings);
  const title = normalized(job.title);
  const body = normalized(`${job.title ?? ''} ${job.description ?? ''}`);
  const location = normalized(job.location);
  let awarded = 0;
  let maximum = 0;
  const reasons = [];

  if (cfg.roles.length) {
    maximum += 35;
    const matches = cfg.roles.filter(role => title.includes(normalized(role)));
    if (matches.length) { awarded += 35; reasons.push(`Rol: ${matches[0]}`); }
  }
  if (cfg.skills.length) {
    maximum += 35;
    const found = cfg.skills.filter(skill => body.includes(normalized(skill)));
    awarded += 35 * found.length / cfg.skills.length;
    if (found.length) reasons.push(`Tecnologías: ${found.slice(0, 4).join(', ')}`);
  }
  if (cfg.remotePreferred) {
    maximum += 20;
    if (job.remote === true || /\b(remoto|remote|teletrabajo)\b/.test(location)) {
      awarded += 20;
      reasons.push('Modalidad remota');
    }
  } else if (cfg.location) {
    maximum += 20;
    if (location.includes(normalized(cfg.location))) {
      awarded += 20;
      reasons.push('Ubicación preferida');
    }
  }
  if (job.postedAt && Number.isFinite(Date.parse(job.postedAt))) {
    maximum += 10;
    const ageDays = (Date.now() - Date.parse(job.postedAt)) / 86_400_000;
    if (ageDays >= 0 && ageDays <= 7) { awarded += 10; reasons.push('Publicación reciente'); }
    else if (ageDays >= 0 && ageDays <= 30) awarded += 4;
  }
  return { score: maximum ? Math.round(awarded / maximum * 100) : null, reasons };
}
