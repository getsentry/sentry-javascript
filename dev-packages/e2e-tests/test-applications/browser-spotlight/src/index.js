import * as Sentry from '@sentry/react';
import { spotlightBrowserIntegration } from '@sentry/browser';

// Initialize Sentry with DSN and tunnel for regular event capture.
// We explicitly add spotlightBrowserIntegration to test that Spotlight
// correctly sends events to the sidecar, bypassing any dev/prod build issues.
Sentry.init({
  dsn: process.env.E2E_TEST_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    // Explicitly add Spotlight integration with the sidecar URL
    spotlightBrowserIntegration({
      sidecarUrl: 'http://localhost:3032/stream',
    }),
  ],
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  environment: 'qa',
  // Use tunnel to capture events at our proxy server
  tunnel: 'http://localhost:3031',
});

document.getElementById('exception-button').addEventListener('click', () => {
  throw new Error('Spotlight test error!');
});
