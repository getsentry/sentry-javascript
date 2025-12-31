import * as Sentry from '@sentry/react';

// Initialize Sentry - the @sentry/react SDK automatically parses
// VITE_SENTRY_SPOTLIGHT from import.meta.env (zero-config for Vite!)
// This tests the automatic SDK initialization feature.
//
// NOTE: We do NOT explicitly set `spotlight` or add `spotlightBrowserIntegration`!
// The SDK automatically:
// 1. Reads VITE_SENTRY_SPOTLIGHT from import.meta.env
// 2. Enables Spotlight with the URL from the env var
// 3. Adds the spotlightBrowserIntegration to send events to the sidecar
Sentry.init({
  dsn: import.meta.env.VITE_E2E_TEST_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  environment: 'qa',
  // Use tunnel to capture events at our proxy server
  tunnel: 'http://localhost:3031',
});

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
