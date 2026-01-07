import * as Sentry from '@sentry/react';

// Debug: Log env vars
console.log('[E2E Debug] VITE_SENTRY_SPOTLIGHT:', import.meta.env.VITE_SENTRY_SPOTLIGHT);
console.log('[E2E Debug] VITE_E2E_TEST_DSN:', import.meta.env.VITE_E2E_TEST_DSN);
console.log('[E2E Debug] MODE:', import.meta.env.MODE);

// Debug: Check if import.meta.env is available at runtime
console.log('[E2E Debug] typeof import.meta:', typeof import.meta);
console.log('[E2E Debug] typeof import.meta.env:', typeof import.meta.env);
console.log('[E2E Debug] import.meta.env object:', JSON.stringify(import.meta.env));

// Initialize Sentry - the @sentry/react SDK automatically parses
// VITE_SENTRY_SPOTLIGHT from import.meta.env (zero-config for Vite!)
const initOptions = {
  dsn: import.meta.env.VITE_E2E_TEST_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
  release: 'e2e-test',
  environment: 'qa',
  // Use tunnel to capture events at our proxy server
  tunnel: 'http://localhost:3031',
  debug: true,
};

console.log(
  '[E2E Debug] Init options BEFORE Sentry.init:',
  JSON.stringify({
    dsn: initOptions.dsn,
    spotlight: initOptions.spotlight,
    debug: initOptions.debug,
  }),
);

const client = Sentry.init(initOptions);

// Debug: Check what the client received
const clientOptions = client?.getOptions();
console.log(
  '[E2E Debug] Client options AFTER Sentry.init:',
  JSON.stringify({
    dsn: clientOptions?.dsn,
    spotlight: clientOptions?.spotlight,
    debug: clientOptions?.debug,
  }),
);

// Debug: Check if Spotlight integration was added
const integrations = clientOptions?.integrations || [];
const integrationNames = integrations.map(i => i.name);
console.log('[E2E Debug] Integrations:', integrationNames.join(', '));
console.log('[E2E Debug] Has SpotlightBrowser:', integrationNames.includes('SpotlightBrowser'));

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
