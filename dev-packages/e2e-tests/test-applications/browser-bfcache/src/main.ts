import * as Sentry from '@sentry/browser';

// Tracing is opt-in per test via `?tracing=1`. The metric tests were written against a client with no
// pageload/navigation spans, and turning tracing on for all of them would put a pageload span's
// transaction name on the scope, which is the value those tests assert the metric falls back to.
const tracing = new URLSearchParams(window.location.search).get('tracing') === '1';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  integrations: tracing
    ? [Sentry.bfcacheMetricsIntegration(), Sentry.browserTracingIntegration()]
    : [Sentry.bfcacheMetricsIntegration()],
  ...(tracing && { tracesSampleRate: 1 }),
  release: 'e2e-test',
  environment: 'qa',
  tunnel: 'http://localhost:3031',
});

// INP only considers interactions whose duration clears the threshold `web-vitals` observes at
// (40ms), and a synthetic click is far quicker than that, so block long enough to be measured.
document.getElementById('slow-interaction')?.addEventListener('click', () => {
  const start = performance.now();
  while (performance.now() - start < 120) {
    /* block the main thread */
  }
});

(window as unknown as { Sentry: typeof Sentry }).Sentry = Sentry;

// Test-only marker: lets the test distinguish a genuine bfcache restore (environment working) from a
// fresh reload (environment not restoring), independently of whether our integration emitted a metric.
window.addEventListener(
  'pageshow',
  event => {
    if ((event as PageTransitionEvent).persisted) {
      (window as unknown as { __bfcacheRestored?: boolean }).__bfcacheRestored = true;
    }
  },
  true,
);

// Deliberately make this page bfcache-ineligible when the test asks for it via `?botch=...`, so we can
// assert the real miss + notRestoredReasons the browser reports. Each botcher is a documented blocker.
const botch = new URLSearchParams(window.location.search).get('botch');

if (botch === 'unload') {
  // An `unload` listener still makes the page ineligible, though the reason Chrome reports for it
  // has changed across versions.
  window.addEventListener('unload', () => {});
}

if (botch === 'websocket') {
  // An open WebSocket blocks bfcache in Chrome < 149; from 149 on it no longer does.
  const ws = new WebSocket('ws://localhost:3034');
  const w = window as unknown as { __wsOpen?: boolean; __ws?: WebSocket };
  w.__wsOpen = false;
  ws.addEventListener('open', () => {
    w.__wsOpen = true;
  });
  w.__ws = ws;
}

if (botch === 'nostore') {
  // The document is served with `Cache-Control: no-store` (see vite.config.ts). A CCNS page is
  // cached but evicted once a cookie changes, so mutate a cookie to force the miss.
  document.cookie = 'bf=1; Path=/';
  (window as unknown as { __nostoreReady?: boolean }).__nostoreReady = true;
}

if (botch === 'indexeddb') {
  // A plain open IndexedDB connection (or even an in-flight transaction) does NOT block bfcache in
  // current Chrome. What still blocks is a connection holding up a version upgrade: open v1 without
  // closing it on `versionchange`, then request v2 - the upgrade is blocked and the page holds it up.
  // A fresh db name per load avoids cross-run persistence.
  const dbName = `bf_${Math.random().toString(36).slice(2)}`;
  const w = window as unknown as { __idbBlocked?: boolean; __db?: IDBDatabase };
  w.__idbBlocked = false;

  const open1 = indexedDB.open(dbName, 1);
  open1.addEventListener('upgradeneeded', event => {
    (event.target as IDBOpenDBRequest).result.createObjectStore('s');
  });
  open1.addEventListener('success', event => {
    w.__db = (event.target as IDBOpenDBRequest).result; // intentionally no `versionchange` handler
    const open2 = indexedDB.open(dbName, 2);
    open2.addEventListener('blocked', () => {
      w.__idbBlocked = true;
    });
  });
}

if (botch === 'iframe-clean' || botch === 'iframe-blocked') {
  // Embed a same-origin child frame. A clean child keeps the top page eligible (hit); a child that
  // blocks makes the whole top page ineligible, and the reason comes from the child frame.
  const iframe = document.createElement('iframe');
  iframe.src = botch === 'iframe-blocked' ? '/iframe.html?blocker=indexeddb' : '/iframe.html';
  const w = window as unknown as { __iframeLoaded?: boolean };
  w.__iframeLoaded = false;
  iframe.addEventListener('load', () => {
    w.__iframeLoaded = true;
  });
  document.body.appendChild(iframe);
}
