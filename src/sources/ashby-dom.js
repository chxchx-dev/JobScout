import { canonicalUrl, plainText } from '../core/opportunity.js';

const ASHBY_HOST = 'jobs.ashbyhq.com';
export const MAX_ASHBY_LINKS = 200;
const MAX_URL_CHARS = 2_048;

function isBoardSlug(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

function ashbyUrl(raw) {
  try {
    const value = String(raw ?? '');
    if (value.length > MAX_URL_CHARS) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== ASHBY_HOST || url.username || url.password) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 1 || segments.length > 2 || !isBoardSlug(segments[0])) return null;
    return { url, segments };
  } catch {
    return null;
  }
}

export function ashbyBoardFromUrl(raw) {
  const parsed = ashbyUrl(raw);
  if (!parsed) return null;
  return {
    board: parsed.segments[0],
    pageType: parsed.segments.length === 1 ? 'board' : 'job'
  };
}

function safeJobUrl(raw, board) {
  const parsed = ashbyUrl(raw);
  if (!parsed || parsed.segments.length !== 2 || parsed.segments[0] !== board) return null;
  return canonicalUrl(parsed.url.toString());
}

// N2 guarda solo enlaces y el rótulo visible del enlace; nunca procesa descripciones.
export function parseAshbyLinks(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !isBoardSlug(raw.board)) return [];

  const page = ashbyBoardFromUrl(raw.pageUrl);
  if (!page || page.board !== raw.board || !Array.isArray(raw.links)) return [];

  const jobs = [];
  const seen = new Set();
  for (const item of raw.links.slice(0, MAX_ASHBY_LINKS * 4)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const url = safeJobUrl(item.url, raw.board);
    const title = plainText(item.title, 180);
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    jobs.push({
      url,
      title,
      platform: 'Ashby',
      sourceId: `ashby-links:${raw.board}`
    });
    if (jobs.length >= MAX_ASHBY_LINKS) break;
  }
  return jobs;
}
