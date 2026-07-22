import * as Sentry from '@sentry/astro';

// Channel-based auto-instrumentation is the default: the SDK subscribes to the build-time injected
// channel events (from the orchestrion Vite plugin) and turns them into Sentry spans.
Sentry.init({
  traceLifecycle: 'static',
  dsn: import.meta.env.PUBLIC_E2E_TEST_DSN,
  environment: 'qa',
  tracesSampleRate: 1.0,
  tunnel: 'http://localhost:3031/', // proxy server
  debug: true,
});
