import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeResponse, sourceEndpoint, fetchBoard } from '../src/sources/adapters.js';

const ashby = { id: 's1', provider: 'ashby', board: 'Example', company: 'Example', policyReviewedAt: '2026-10-21' };
const greenhouse = { id: 's2', provider: 'greenhouse', board: 'sample', company: 'Sample', policyReviewedAt: '2026-10-21' };

const okJson = (body, extra = {}) => ({
  ok: true, status: 200, url: 'https://api.ashbyhq.com/x',
  headers: new Headers(), text: async () => JSON.stringify(body), ...extra
});

test('Ashby: endpoint estricto y sin inyección de rutas', () => {
  assert.match(sourceEndpoint(ashby), /^https:\/\/api\.ashbyhq\.com\/posting-api\/job-board\/Example/);
  assert.throws(() => sourceEndpoint({ ...ashby, board: '../secrets' }));
});

test('Ashby: normaliza remoto sin tocar la página', () => {
  const jobs = normalizeResponse(ashby, { jobs: [{ title: 'Python Developer', jobUrl: 'https://jobs.ashbyhq.com/example/abc', location: 'Remote', isRemote: true }] });
  assert.equal(jobs[0].remote, true);
});

test('Greenhouse: transforma solo anuncios válidos y limpia HTML', () => {
  const jobs = normalizeResponse(greenhouse, { jobs: [{ title: 'Engineer', absolute_url: 'https://boards.greenhouse.io/example/jobs/111', content: '<img src=x onerror=alert(1)>Scala' }] });
  assert.equal(jobs.length, 1);
  assert.doesNotMatch(jobs[0].description, /onerror=/);
});

test('API: no envía credenciales por defecto', async () => {
  await fetchBoard(ashby, async (url, options) => {
    assert.equal(options.credentials, 'omit');
    assert.match(url, /^https:\/\/api\.ashbyhq\.com/);
    return okJson({ jobs: [] });
  });
});

test('API N0: omite sesión aunque la configuración antigua la marque', async () => {
  await fetchBoard({ ...ashby, session: true }, async (_url, options) => {
    assert.equal(options.credentials, 'omit');
    return okJson({ jobs: [] });
  });
});

test('API: no sigue redirecciones automáticas', async () => {
  await fetchBoard(ashby, async (_url, options) => {
    assert.equal(options.redirect, 'error');
    return okJson({ jobs: [] }, { url: 'https://api.ashbyhq.com/posting-api/job-board/Example/' });
  });
});

test('API: rechaza redirección a otro host', async () => {
  await assert.rejects(
    () => fetchBoard(ashby, async () => okJson({ jobs: [] }, { url: 'https://evil.example.com/x' })),
    (error) => error.kind === 'cross-host-redirect'
  );
});

test('API: aplica límite de tiempo mediante señal', async () => {
  await fetchBoard(ashby, async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    return okJson({ jobs: [] });
  });
});

test('API: señala resultados truncados sin fingir completitud', async () => {
  const one = { title: 'DevOps', jobUrl: 'https://jobs.ashbyhq.com/jobs/1' };
  const response = await fetchBoard(ashby, async () => okJson({ jobs: Array(201).fill(one) }));
  assert.equal(response.truncated, true);
  assert.equal(response.jobs.length, 200);
});

for (const status of [401, 403, 429]) {
  test(`API: HTTP ${status} marca throttled y no reintenta dentro del intento`, async () => {
    let calls = 0;
    await assert.rejects(
      () => fetchBoard(greenhouse, async () => { calls++; return { ok: false, status, headers: new Headers() }; }),
      (error) => error.throttle === true && error.status === status
    );
    assert.equal(calls, 1);
  });
}

test('API: 5xx se marca reintentable sin abrir disyuntor', async () => {
  await assert.rejects(
    () => fetchBoard(greenhouse, async () => ({ ok: false, status: 503, headers: new Headers() })),
    (error) => error.retryable === true && error.throttle !== true
  );
});

test('API: los fallos de red se marcan reintentables', async () => {
  await assert.rejects(
    () => fetchBoard(greenhouse, async () => { throw new TypeError('offline'); }),
    (error) => error.retryable === true && error.kind === 'network'
  );
});
