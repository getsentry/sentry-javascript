import * as Sentry from '@sentry/browser';

Sentry.init({
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  debug: true,
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1.0,
});

// Check environment variables
let viteSpotlight = 'undefined';
let processEnvSpotlight = 'undefined';
let importMetaSpotlight = 'undefined';

try {
  // Check process.env (should work via bundler transformation)
  if (typeof process !== 'undefined' && process.env) {
    processEnvSpotlight = process.env.VITE_SENTRY_SPOTLIGHT || 'undefined';
  }
} catch (e) {
  processEnvSpotlight = 'error: ' + (e as Error).message;
}

try {
  // Check import.meta.env (Vite-specific)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    importMetaSpotlight = import.meta.env.VITE_SENTRY_SPOTLIGHT || 'undefined';
    viteSpotlight = importMetaSpotlight;
  }
} catch (e) {
  importMetaSpotlight = 'error: ' + (e as Error).message;
}

// Check if Spotlight integration is registered
const client = Sentry.getClient();
const spotlightIntegration = client?.getIntegrationByName?.('SpotlightBrowser');
const spotlightEnabled = !!spotlightIntegration;

// Check if import.meta is available (ESM build check)
let importMetaAvailable = false;
try {
  importMetaAvailable = typeof import.meta !== 'undefined';
} catch (e) {
  importMetaAvailable = false;
}

// Update DOM
document.getElementById('vite-spotlight-value')!.textContent = viteSpotlight;
document.getElementById('process-env-value')!.textContent = processEnvSpotlight;
document.getElementById('import-meta-value')!.textContent = importMetaSpotlight;
document.getElementById('spotlight-status-value')!.textContent = spotlightEnabled ? 'ENABLED' : 'DISABLED';
document.getElementById('import-meta-available-value')!.textContent = importMetaAvailable ? 'YES (ESM)' : 'NO (CJS)';

console.log('Spotlight env test results:', {
  viteSpotlight,
  processEnvSpotlight,
  importMetaSpotlight,
  spotlightEnabled,
  importMetaAvailable,
});
