import * as Sentry from '@sentry/browser';
// Import this separately so that generatePlugin can handle it for CDN scenarios
import { feedbackIntegration } from '@sentry/browser';

const feedback = feedbackIntegration({
  autoInject: false,
});

window.Sentry = Sentry;
window.feedback = feedback;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [feedback],
});

feedback.attachTo('#custom-feedback-button');
