import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1.0,
  // A fixed release, so that a release from the CI environment does not change the span attributes.
  release: '1.0',
  // The Context integration adds machine-specific attributes to segment spans, and adds the `os.*` ones only after an
  // async lookup. Without it, the tests can compare all span attributes.
  integrations: integrations => integrations.filter(integration => integration.name !== 'Context'),
});
