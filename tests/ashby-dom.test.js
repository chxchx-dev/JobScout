import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpportunity } from '../src/core/opportunity.js';
import { ashbyBoardFromUrl, MAX_ASHBY_LINKS, parseAshbyLinks } from '../src/sources/ashby-dom.js';

const boardUrl = 'https://jobs.ashbyhq.com/acme-corp';
const jobUrl = 'https://jobs.ashbyhq.com/acme-corp/12345678';

test('Ashby N2: detecta el único tablero o una oferta de su misma ruta', () => {
  assert.deepEqual(ashbyBoardFromUrl(boardUrl), { board: 'acme-corp', pageType: 'board' });
  assert.deepEqual(ashbyBoardFromUrl(jobUrl), { board: 'acme-corp', pageType: 'job' });
  assert.equal(ashbyBoardFromUrl('https://jobs.ashbyhq.com/'), null);
  assert.equal(ashbyBoardFromUrl('https://evil.example/acme-corp'), null);
  assert.equal(ashbyBoardFromUrl('http://jobs.ashbyhq.com/acme-corp'), null);
  assert.equal(ashbyBoardFromUrl('https://user:pass@jobs.ashbyhq.com/acme-corp'), null);
  assert.equal(ashbyBoardFromUrl(`https://jobs.ashbyhq.com/${'a'.repeat(2_050)}`), null);
});

test('Ashby N2: normaliza y guarda solo URL, título y origen del tablero', () => {
  const jobs = parseAshbyLinks({
    board: 'acme-corp',
    pageUrl: boardUrl,
    links: [{ url: `${jobUrl}?utm_source=board`, title: '  Senior Backend Engineer  ' }]
  });

  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0], {
    url: jobUrl,
    title: 'Senior Backend Engineer',
    platform: 'Ashby',
    sourceId: 'ashby-links:acme-corp'
  });
  const opportunity = createOpportunity(jobs[0]);
  assert.equal(opportunity.company, '');
  assert.equal(opportunity.location, '');
  assert.equal(opportunity.description, '');
});

test('Ashby N2: rechaza otras fuentes, tableros y rutas que no sean ofertas del tablero', () => {
  assert.deepEqual(parseAshbyLinks({
    board: 'acme-corp', pageUrl: boardUrl,
    links: [
      { url: 'https://evil.example/acme-corp/1', title: 'Engineer' },
      { url: 'http://jobs.ashbyhq.com/acme-corp/1', title: 'Engineer' },
      { url: 'https://jobs.ashbyhq.com/other-board/1', title: 'Engineer' },
      { url: boardUrl, title: 'Careers' },
      { url: 'https://jobs.ashbyhq.com/acme-corp/1/application', title: 'Apply' },
      { url: 'https://user:pass@jobs.ashbyhq.com/acme-corp/2', title: 'Engineer' },
      { url: jobUrl, title: '' }
    ]
  }), []);
  assert.deepEqual(parseAshbyLinks({ board: '../other', pageUrl: boardUrl, links: [{ url: jobUrl, title: 'Engineer' }] }), []);
  assert.deepEqual(parseAshbyLinks({ board: 'acme-corp', pageUrl: 'https://evil.example/acme-corp', links: [] }), []);
});

test('Ashby N2: deduplica por URL y recorta texto externo antes de guardar', () => {
  const jobs = parseAshbyLinks({
    board: 'acme-corp', pageUrl: boardUrl,
    links: [
      { url: jobUrl, title: '<img src=x onerror=alert(1)> Security Engineer' },
      { url: `${jobUrl}?utm_campaign=jobs`, title: 'Duplicado' }
    ]
  });
  assert.equal(jobs.length, 1);
  assert.equal(createOpportunity(jobs[0]).title, 'Security Engineer');
});

test('Ashby N2: limita la carga a 200 enlaces', () => {
  const links = Array.from({ length: MAX_ASHBY_LINKS + 20 }, (_, index) => ({
    url: `https://jobs.ashbyhq.com/acme-corp/${index + 1}`,
    title: `Role ${index + 1}`
  }));
  assert.equal(parseAshbyLinks({ board: 'acme-corp', pageUrl: boardUrl, links }).length, MAX_ASHBY_LINKS);
});
