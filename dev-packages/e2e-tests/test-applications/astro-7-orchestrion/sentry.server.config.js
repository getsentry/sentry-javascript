import * as Sentry from '@sentry/astro';
import { experimentalUseDiagnosticsChannelInjection } from '@sentry/node';

// Registers the diagnostics-channel subscribers that turn the build-time
// injected channel events (from the orchestrion Vite plugin) into Sentry spans.
// Must run before Sentry.init()
experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  traceLifecycle: 'static',
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  environment: 'qa',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
  debug: true,
});
