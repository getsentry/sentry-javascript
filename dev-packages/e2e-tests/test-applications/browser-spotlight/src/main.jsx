import * as Sentry from '@sentry/react';

// Log debug info about the Spotlight env var and SDK state
console.log('[E2E Debug] VITE_SENTRY_SPOTLIGHT:', import.meta.env.VITE_SENTRY_SPOTLIGHT);
console.log('[E2E Debug] VITE_E2E_TEST_DSN:', import.meta.env.VITE_E2E_TEST_DSN);

// Initialize Sentry - the @sentry/react SDK automatically parses
// VITE_SENTRY_SPOTLIGHT from import.meta.env (zero-config for Vite!)
// This tests the automatic SDK initialization feature.
const client = Sentry.init({
  dsn: import.meta.env.VITE_E2E_TEST_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  environment: 'qa',
  // Use tunnel to capture events at our proxy server
  tunnel: 'http://localhost:3031',
  debug: true,
  // NOTE: We intentionally do NOT set `spotlight` here!
  // The SDK should automatically parse VITE_SENTRY_SPOTLIGHT env var
  // and enable Spotlight with the URL from the env var
});

// Debug: Check if Spotlight integration was added
console.log('[E2E Debug] Sentry client:', client);
console.log('[E2E Debug] Integrations:', client?.getIntegrations?.());
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
