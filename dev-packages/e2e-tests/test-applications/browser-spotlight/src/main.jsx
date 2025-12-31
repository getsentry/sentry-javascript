import * as Sentry from '@sentry/react';

// Log debug info about the Spotlight env var and SDK state
console.log('[E2E Debug] VITE_SENTRY_SPOTLIGHT:', import.meta.env.VITE_SENTRY_SPOTLIGHT);
console.log('[E2E Debug] VITE_E2E_TEST_DSN:', import.meta.env.VITE_E2E_TEST_DSN);

// Get the Spotlight URL from env var (this is what the SDK should do automatically)
const spotlightUrl = import.meta.env.VITE_SENTRY_SPOTLIGHT;

// Initialize Sentry with Spotlight integration
// We explicitly add the Spotlight integration here to test that the env var is
// correctly passed through and that Spotlight sends events to the sidecar.
const client = Sentry.init({
  dsn: import.meta.env.VITE_E2E_TEST_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    // Explicitly add Spotlight integration - this is what the SDK would do
    // automatically if using the dev build (spotlight code is stripped from prod builds)
    Sentry.spotlightBrowserIntegration({
      sidecarUrl: spotlightUrl,
    }),
  ],
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  environment: 'qa',
  // Use tunnel to capture events at our proxy server
  tunnel: 'http://localhost:3031',
  debug: true,
});

// Debug: Check if Spotlight integration was added
console.log('[E2E Debug] Sentry client:', client);
const spotlightIntegration = client?.getIntegration?.('Spotlight');
console.log('[E2E Debug] Spotlight integration:', spotlightIntegration);

// Simple render without React DOM to keep dependencies minimal
document.getElementById('root').innerHTML = `
  <div>
    <h1>Spotlight E2E Test</h1>
    <p>This page tests that VITE_SENTRY_SPOTLIGHT env var enables Spotlight integration.</p>
    <button id="exception-button">Trigger Error</button>
  </div>
`;

document.getElementById('exception-button').addEventListener('click', () => {
  throw new Error('Spotlight test error!');
});
