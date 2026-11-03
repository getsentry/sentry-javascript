import * as Sentry from '@sentry/browser';

// So we can use this in subject.js
// We specifically DO NOT set this on window.Sentry as we want to test a non-CDN bundle environment,
// where window.Sentry is usually not available
window._testSentry = { ...Sentry };

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [],
});
