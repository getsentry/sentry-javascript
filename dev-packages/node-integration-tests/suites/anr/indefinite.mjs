import * as Sentry from '@sentry/node';
import { waitForDebuggerReady } from '@sentry-internal/test-utils';

setTimeout(() => {
  process.exit();
}, 10000);

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  integrations: [Sentry.anrIntegration({ captureStackTrace: true, anrThreshold: 100 })],
});

Sentry.setUser({ email: 'person@home.com' });
Sentry.addBreadcrumb({ message: 'important message!' });

function longWork() {
  let n = 1;
  for (let i = 0; i < 2000000000; i++) {
    n = (n * 1103515245 + 12345) % 2147483648;
  }
  return n;
}

waitForDebuggerReady(() => {
  longWork();
});
