import * as Sentry from '@sentry/browser';
// Import this separately so that generatePlugin can handle it for CDN scenarios
import { feedbackIntegration } from '@sentry/browser';

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 1.0,
  integrations: [Sentry.replayIntegration(), feedbackIntegration()],
});

document.addEventListener('securitypolicyviolation', () => {
  const container = document.querySelector('#csp-violation');
  if (container) {
    container.innerText = 'CSP Violation';
  }
});
