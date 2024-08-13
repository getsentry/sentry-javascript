import * as Sentry from '@sentry/browser';
// Import this separately so that generatePlugin can handle it for CDN scenarios
import { feedbackIntegration } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    feedbackIntegration({ tags: { from: 'integration init' }, styleNonce: 'foo1234', scriptNonce: 'foo1234' }),
  ],
});

document.addEventListener('securitypolicyviolation', () => {
  const container = document.querySelector('#csp-violation');
  if (container) {
    container.innerText = 'CSP Violation';
  }
});
