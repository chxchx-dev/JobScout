const ASHBY_HOST = 'jobs.ashbyhq.com';
const MAX_LINKS = 200;
const MAX_ANCHORS = 4_000;
const TITLE_LIMIT = 180;
const MAX_URL_CHARS = 2_048;

if (!globalThis.__jobscoutAshbyContentLoaded) {
  globalThis.__jobscoutAshbyContentLoaded = true;

  let busy = false;
  let scheduled = false;
  let stopped = false;
  let scannedSignature = '';
  let observer;

  function currentPage() {
    try {
      if (location.href.length > MAX_URL_CHARS || location.protocol !== 'https:' || location.hostname !== ASHBY_HOST) return null;
      const segments = location.pathname.split('/').filter(Boolean);
      if (segments.length < 1 || segments.length > 2 || !/^[A-Za-z0-9_-]{1,80}$/.test(segments[0])) return null;
      return { board: segments[0], pageType: segments.length === 1 ? 'board' : 'job' };
    } catch {
      return null;
    }
  }

  function compactTitle(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_LIMIT);
  }

  function titleFromLink(anchor) {
    const heading = anchor.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
    return compactTitle(heading?.textContent || anchor.getAttribute('aria-label') || anchor.getAttribute('title'));
  }

  function isJobUrl(raw, board) {
    try {
      if (typeof raw !== 'string' || raw.length > MAX_URL_CHARS) return false;
      const url = new URL(raw, location.href);
      const segments = url.pathname.split('/').filter(Boolean);
      return url.protocol === 'https:' && url.hostname === ASHBY_HOST &&
        segments.length === 2 && segments[0] === board && !url.username && !url.password;
    } catch {
      return false;
    }
  }

  function collectLinks(page) {
    if (page.pageType === 'job') {
      const title = compactTitle(document.querySelector('h1')?.textContent);
      return title ? { links: [{ url: location.href, title }], truncated: false } : { links: [], truncated: false };
    }

    const anchors = [...document.querySelectorAll('a[href]')];
    const links = [];
    const seen = new Set();
    let truncated = anchors.length > MAX_ANCHORS;

    for (const anchor of anchors.slice(0, MAX_ANCHORS)) {
      const rawUrl = anchor.getAttribute('href');
      if (!isJobUrl(rawUrl, page.board)) continue;
      const url = new URL(rawUrl, location.href).href;
      if (seen.has(url)) continue;
      const title = titleFromLink(anchor);
      if (!title) continue;
      if (links.length >= MAX_LINKS) {
        truncated = true;
        break;
      }
      seen.add(url);
      links.push({ url, title });
    }

    return { links, truncated };
  }

  async function scanCurrentPage() {
    const page = currentPage();
    if (stopped || busy || !page || document.visibilityState !== 'visible') return;
    const pageUrl = location.href;
    busy = true;
    try {
      const gate = await chrome.runtime.sendMessage({
        type: 'ASHBY_SCAN_READY',
        board: page.board,
        visible: document.visibilityState === 'visible'
      });
      if (stopped || !gate?.scan || location.href !== pageUrl) return;
      if (document.visibilityState !== 'visible' || currentPage()?.board !== page.board) return;

      const payload = collectLinks(page);
      const signature = JSON.stringify(payload.links);
      if (!payload.links.length || signature === scannedSignature) return;

      const result = await chrome.runtime.sendMessage({
        type: 'ASHBY_LINKS_RESULT',
        payload: { board: page.board, links: payload.links, truncated: payload.truncated, visible: true }
      });
      if (result?.ok) scannedSignature = signature;
    } catch {
      // Fallos de mensajería o datos de página no deben alterar el sitio.
    } finally {
      busy = false;
    }
  }

  function scheduleScan() {
    if (stopped || scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      void scanCurrentPage();
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1_000 });
    else queueMicrotask(run);
  }

  scheduleScan();
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') scheduleScan();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('popstate', scheduleScan);
  window.addEventListener('hashchange', scheduleScan);
  const onRuntimeMessage = (message) => {
    if (message?.type === 'ASHBY_SCAN_STOP') {
      stopped = true;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('popstate', scheduleScan);
      window.removeEventListener('hashchange', scheduleScan);
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      delete globalThis.__jobscoutAshbyContentLoaded;
      return false;
    }
    if (message?.type !== 'ASHBY_SCAN_NOW') return false;
    scannedSignature = '';
    scheduleScan();
    return false;
  };
  chrome.runtime.onMessage.addListener(onRuntimeMessage);

  // Ashby cambia la lista y las ofertas dentro de una SPA sin navegación completa.
  observer = new MutationObserver(() => {
    if (document.visibilityState === 'visible') scheduleScan();
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'aria-label', 'title']
    });
  }
}
