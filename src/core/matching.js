import { compactText } from './opportunity.js';

export const DEFAULT_SETTINGS = Object.freeze({
  roles: ['software engineer', 'backend developer', 'software architect'],
  skills: ['javascript', 'python', '.net', 'postgresql'],
  location: 'Colombia',
  remotePreferred: true,
  expectedSalaryCop: '',
  minScore: 0,
  autoScanAshby: false,
  autoScanAshbyBoard: null,
  autoScanAshbyPolicyReviewedAt: null,
  sources: []
});

export function termsFrom(value) {
  const values = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(values.map(x => compactText(x, 60).toLowerCase()).filter(Boolean))].slice(0, 35);
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString() : null;
}

export function sanitizeSettings(raw = {}) {
  const reviewedAt = typeof raw.autoScanAshbyPolicyReviewedAt === 'string' &&
    Number.isFinite(Date.parse(raw.autoScanAshbyPolicyReviewedAt))
    ? new Date(raw.autoScanAshbyPolicyReviewedAt).toISOString() : null;
  const autoScanAshbyBoard = /^[A-Za-z0-9_-]{1,80}$/.test(String(raw.autoScanAshbyBoard ?? ''))
    ? String(raw.autoScanAshbyBoard) : null;
  return {
    roles: termsFrom(raw.roles ?? DEFAULT_SETTINGS.roles),
    skills: termsFrom(raw.skills ?? DEFAULT_SETTINGS.skills),
    location: compactText(raw.location ?? DEFAULT_SETTINGS.location, 120),
    remotePreferred: raw.remotePreferred === true,
    expectedSalaryCop: /^[0-9]{0,12}$/.test(String(raw.expectedSalaryCop ?? '')) ? String(raw.expectedSalaryCop ?? '') : '',
    minScore: Math.min(100, Math.max(0, Number(raw.minScore) || 0)),
    autoScanAshby: raw.autoScanAshby === true && Boolean(reviewedAt) && Boolean(autoScanAshbyBoard),
    autoScanAshbyBoard: raw.autoScanAshby === true && reviewedAt ? autoScanAshbyBoard : null,
    autoScanAshbyPolicyReviewedAt: reviewedAt,
    sources: (() => {
      return Array.isArray(raw.sources) ? raw.sources.slice(0, 30)
        .filter(x => x && typeof x === 'object' && ['ashby', 'greenhouse'].includes(x.provider) && /^[A-Za-z0-9_-]{1,80}$/.test(x.board ?? ''))
        .map(x => {
          const policyReviewedAt = validTimestamp(x.policyReviewedAt);
          const enabled = x.enabled === true && Boolean(policyReviewedAt);
          return {
            id: /^[a-zA-Z0-9-]{1,80}$/.test(String(x.id ?? '')) ? String(x.id) : 'invalid',
            provider: x.provider,
            board: x.board,
            company: compactText(x.company, 120),
            enabled,
            policyReviewedAt,
            level: ['A0', 'A1', 'A2'].includes(x.level) ? x.level : 'A0',
            throttled: x.throttled === true,
            cleanSessions: Math.max(0, Math.min(1000, Math.floor(Number(x.cleanSessions) || 0))),
            lastAttemptAt: validTimestamp(x.lastAttemptAt),
            lastCheckedAt: validTimestamp(x.lastCheckedAt),
            session: false
          };
        }) : [];
    })()
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
