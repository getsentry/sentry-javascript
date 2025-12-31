import * as Sentry from '@sentry/react';

// Log debug info about the Spotlight env var
console.log('[E2E Debug] VITE_SENTRY_SPOTLIGHT:', import.meta.env.VITE_SENTRY_SPOTLIGHT);
console.log('[E2E Debug] VITE_E2E_TEST_DSN:', import.meta.env.VITE_E2E_TEST_DSN);
console.log('[E2E Debug] Full import.meta.env:', JSON.stringify(import.meta.env));

// Initialize Sentry - the @sentry/react SDK automatically parses
// VITE_SENTRY_SPOTLIGHT from import.meta.env (zero-config for Vite!)
// This tests the automatic SDK initialization feature.
//
// NOTE: We do NOT explicitly set `spotlight` or add `spotlightBrowserIntegration`!
// The SDK should automatically:
// 1. Read VITE_SENTRY_SPOTLIGHT from import.meta.env
// 2. Enable Spotlight with the URL from the env var
// 3. Add the spotlightBrowserIntegration to send events to the sidecar
const client = Sentry.init({
  dsn: import.meta.env.VITE_E2E_TEST_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  environment: 'qa',
  // Use tunnel to capture events at our proxy server
  tunnel: 'http://localhost:3031',
  debug: true,
  // DEBUG: Log the options to see if spotlight is set
  beforeSend(event) {
    console.log('[E2E Debug] beforeSend called, event type:', event.type || 'error');
    return event;
  },
});

// Debug: Check if Spotlight integration was automatically added
console.log('[E2E Debug] Sentry client:', client);
console.log('[E2E Debug] Client options:', client?.getOptions?.());
const spotlightIntegration = client?.getIntegration?.('Spotlight');
console.log('[E2E Debug] Spotlight integration (should be present):', spotlightIntegration);

// List all integrations
const allIntegrations = client?.getOptions?.()?.integrations || [];
console.log('[E2E Debug] All integrations:', allIntegrations.map(i => i.name).join(', '));

if (!spotlightIntegration) {
  console.error('[E2E Debug] ERROR: Spotlight integration was NOT automatically added!');
  console.error('[E2E Debug] This means the VITE_SENTRY_SPOTLIGHT env var support is not working.');
}

// Simple render
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
