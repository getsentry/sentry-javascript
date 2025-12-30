import * as Sentry from '@sentry/react';

// Initialize Sentry with DSN and tunnel for regular event capture
// SENTRY_SPOTLIGHT is injected via webpack's EnvironmentPlugin at build time
// The @sentry/react SDK automatically parses SENTRY_SPOTLIGHT and enables Spotlight
Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  environment: 'qa',
  // Use tunnel to capture events at our proxy server
  tunnel: 'http://localhost:3031',
  // NOTE: We intentionally do NOT set `spotlight` here!
  // The SDK should automatically parse SENTRY_SPOTLIGHT env var
  // and enable Spotlight with the URL from the env var
});

document.getElementById('exception-button').addEventListener('click', () => {
  throw new Error('Spotlight test error!');
});
