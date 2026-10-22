import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl, createOpportunity, guessPlatform, isSupportedBackup, validateImportedJob } from '../src/core/opportunity.js';
import { calculateMatch, sanitizeSettings } from '../src/core/matching.js';

test('canonicaliza parámetros de tracking pero conserva los parámetros de trabajo', () => {
  assert.equal(canonicalUrl('https://example.org/jobs?id=11&utm_source=app#details'), 'https://example.org/jobs?id=11');
  assert.equal(canonicalUrl('https://example.org/jobs?gh_jid=9&fbclid=x'), 'https://example.org/jobs?gh_jid=9');
  assert.equal(canonicalUrl('https://example.org/jobs?ref=nav&id=3&gclid=y'), 'https://example.org/jobs?id=3');
});

test('rechaza URLs inseguras y credenciales incrustadas', () => {
  for (const url of ['javascript:alert(1)', 'file:///tmp/1', 'http://example.org', 'https://user:pass@example.org/']) {
    assert.throws(() => createOpportunity({ title: 'Backend', url }));
  }
});

test('conserva un identificador estable por URL para deduplicar', () => {
  const a = createOpportunity({ title: 'A', url: 'https://example.org/?id=1&utm_medium=social' });
  const b = createOpportunity({ title: 'B', url: 'https://example.org/?id=1' });
  assert.equal(a.id, b.id);
});

test('no fusiona URLs distintas con mismo título', () => {
  const a = createOpportunity({ title: 'Backend', url: 'https://example.org/1' });
  const b = createOpportunity({ title: 'Backend', url: 'https://example.org/2' });
  assert.notEqual(a.id, b.id);
});

test('identifica origen sin extraer información de las páginas', () => {
  assert.equal(guessPlatform('https://www.linkedin.com/jobs/view/4'), 'LinkedIn');
  assert.equal(guessPlatform('https://www.upwork.com/freelance-jobs/'), 'Upwork');
});

test('puntuación transparente para coincidencias y trabajo remoto', () => {
  const job = createOpportunity({ title: 'Software Engineer Python', url: 'https://example.org/1', description: 'Python PostgreSQL', remote: true });
  const match = calculateMatch(job, { roles: ['software engineer'], skills: ['python', 'postgresql'], remotePreferred: true });
  assert.equal(match.score, 100);
  assert.ok(match.reasons.length);
});

test('salario es solo referencia, no altera la puntuación', () => {
  const job = createOpportunity({ title: 'Software Engineer', url: 'https://example.org/2' });
  const base = { roles: ['software engineer'], skills: [], remotePreferred: false, location: '' };
  assert.equal(calculateMatch(job, { ...base, expectedSalaryCop: '' }).score, calculateMatch(job, { ...base, expectedSalaryCop: '99999999' }).score);
});

test('normaliza preferencias y no duplica roles equivalentes', () => {
  assert.equal(sanitizeSettings({ roles: 'Backend, backend', skills: 'SQL, PYTHON' }).roles.length, 1);
});

test('settings: el escaneo N2 de Ashby queda apagado por defecto y fija un solo tablero', () => {
  assert.equal(sanitizeSettings({}).autoScanAshby, false);
  assert.equal(sanitizeSettings({ autoScanAshby: true }).autoScanAshby, false);
  assert.equal(sanitizeSettings({ autoScanAshby: true, autoScanAshbyPolicyReviewedAt: 'invalida' }).autoScanAshby, false);
  assert.equal(sanitizeSettings({
    autoScanAshby: true,
    autoScanAshbyBoard: 'acme-corp',
    autoScanAshbyPolicyReviewedAt: '2026-10-22T00:00:00.000Z'
  }).autoScanAshby, true);
  assert.equal(sanitizeSettings({
    autoScanAshby: true,
    autoScanAshbyBoard: '../another-board',
    autoScanAshbyPolicyReviewedAt: '2026-10-22T00:00:00.000Z'
  }).autoScanAshby, false);
  assert.equal(sanitizeSettings({ autoScanAshbyBoard: 'acme-corp' }).autoScanAshbyBoard, null);
});

test('settings: no restaura la sincronización N0 automática heredada', () => {
  const settings = sanitizeSettings({
    sources: [{
      id: 'old-ashby-source', provider: 'ashby', board: 'acme-corp', company: 'Acme',
      enabled: true, policyReviewedAt: '2026-10-22T00:00:00.000Z', autoSyncOnDashboardOpen: true
    }]
  });
  assert.equal(settings.sources[0].enabled, true);
  assert.equal(settings.sources[0].autoSyncOnDashboardOpen, undefined);
});

test('normalización de respaldo impide modificar ID y estado arbitrariamente', () => {
  const job = validateImportedJob({ id: 'arbitrary', title: 'A', url: 'https://example.org/a', status: 'hacked', notes: 'ok' });
  assert.equal(job.id, 'url:https://example.org/a');
  assert.equal(job.status, 'new');
});

test('acepta respaldos JobScout nuevos y respaldos previos para migración', () => {
  assert.equal(isSupportedBackup({ format: 'jobscout-backup', version: 1, opportunities: [] }), true);
  assert.equal(isSupportedBackup({ format: 'rolenexa-backup', version: 1, opportunities: [] }), true);
  assert.equal(isSupportedBackup({ format: 'otro', version: 1, opportunities: [] }), false);
});

test('sobrevive a Unicode, títulos largos y querystring significativo', () => {
  const job = createOpportunity({
    title: 'Ingeniero de Datos 中文 🚀'.padEnd(300, 'x'),
    url: 'https://example.org/oferta?gh_jid=42&utm_campaign=z',
    description: 'Café, ñandú, 日本語'
  });
  assert.match(job.title, /中文 🚀/);
  assert.match(job.description, /ñandú/);
  assert.ok(job.url.includes('gh_jid=42'));
  assert.ok(!job.url.includes('utm_campaign'));
});

test('no ejecuta HTML embebido en campos externos', () => {
  const job = createOpportunity({
    title: '<img src=x onerror=alert(1)>Dev',
    url: 'https://example.org/3',
    description: '<script>alert(2)</script>Scala'
  });
  assert.doesNotMatch(job.description, /onerror=/);
  assert.doesNotMatch(job.description, /<script>/);
});
