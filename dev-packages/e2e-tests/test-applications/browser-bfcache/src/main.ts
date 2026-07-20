import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  integrations: [Sentry.bfcacheMetricsIntegration()],
  release: 'e2e-test',
  environment: 'qa',
  tunnel: 'http://localhost:3031',
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
  // An `unload` listener is the canonical, version-stable bfcache blocker.
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
