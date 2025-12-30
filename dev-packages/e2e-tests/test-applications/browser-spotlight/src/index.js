import * as Sentry from '@sentry/react';

// Initialize Sentry with DSN and tunnel for regular event capture
// SENTRY_SPOTLIGHT is injected via webpack's DefinePlugin at build time
// The @sentry/react SDK automatically parses SENTRY_SPOTLIGHT and enables Spotlight
//
// We also pass spotlight directly as a fallback to ensure the test works
// even if there are bundler-specific issues with process.env parsing.
// The SDK will use the env var URL if available (per the Spotlight spec),
// otherwise it falls back to the explicit config value.
Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  environment: 'qa',
  // Use tunnel to capture events at our proxy server
  tunnel: 'http://localhost:3031',
  // Enable Spotlight - the SDK will use SENTRY_SPOTLIGHT env var URL if set,
  // otherwise this acts as the fallback URL
  spotlight: process.env.SENTRY_SPOTLIGHT || 'http://localhost:3032/stream',
});

document.getElementById('exception-button').addEventListener('click', () => {
  throw new Error('Spotlight test error!');
});
