import { createOpportunity, compactText } from '../core/opportunity.js';

const BOARD_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

export function validateSource(source) {
  if (!source || !['ashby', 'greenhouse'].includes(source.provider)) {
    throw new Error('Proveedor de fuente no admitido.');
  }
  if (!BOARD_PATTERN.test(source.board ?? '')) throw new Error('Identificador del tablero inválido.');
  if (!source.policyReviewedAt) throw new Error('Revisa los permisos de uso de esa fuente antes de habilitarla.');
  return source;
}

export function sourceEndpoint(source) {
  validateSource(source);
  const board = encodeURIComponent(source.board);
  if (source.provider === 'ashby') {
    return `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`;
  }
  return `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`;
}

export function normalizeResponse(source, data) {
  validateSource(source);
  if (!data || !Array.isArray(data.jobs)) throw new Error('La API respondió con un formato inesperado.');
  const jobs = [];
  for (const item of data.jobs.slice(0, 200)) {
    try {
      let candidate;
      if (source.provider === 'ashby') {
        candidate = {
          url: item.jobUrl,
          title: item.title,
          company: source.company,
          location: item.location,
          description: item.descriptionPlain,
          remote: item.isRemote === true || item.workplaceType === 'Remote' ? true : (item.isRemote === false ? false : null),
          salaryText: item.compensation?.compensationTierSummary || '',
          postedAt: item.publishedAt,
          platform: 'Ashby',
          sourceId: source.id
        };
      } else {
        candidate = {
          url: item.absolute_url,
          title: item.title,
          company: source.company,
          location: item.location?.name,
          // Texto plano exclusivamente; jamás insertamos HTML de un proveedor.
          description: compactText(String(item.content ?? '').replace(/<[^>]+>/g, ' '), 2500),
          remote: /\b(remote|remoto|teletrabajo)\b/i.test(item.location?.name ?? '') ? true : null,
          postedAt: item.first_published || null,
          platform: 'Greenhouse',
          sourceId: source.id
        };
      }
      jobs.push(createOpportunity(candidate));
    } catch {
      // Entrada inválida o enlace no HTTPS: no se muestra ni se abre.
    }
  }
  return jobs;
}

export async function fetchBoard(source, fetchFn = fetch) {
  const endpoint = sourceEndpoint(source);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetchFn(endpoint, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if ([401, 403, 429].includes(response.status)) {
      const error = new Error(`El proveedor devolvió HTTP ${response.status}. Conector desactivado por protección.`);
      error.disableSource = true;
      throw error;
    }
    if (!response.ok) throw new Error(`Error HTTP ${response.status} de ${source.provider}.`);
    const bytes = Number(response.headers.get('content-length'));
    if (bytes > 2_500_000) throw new Error('Respuesta excesivamente grande.');
    const body = await response.text();
    if (body.length > 2_500_000) throw new Error('Respuesta excesivamente grande.');
    const payload = JSON.parse(body);
    return { jobs: normalizeResponse(source, payload), truncated: payload.jobs.length > 200 };
  } finally {
    clearTimeout(timeout);
  }
}
