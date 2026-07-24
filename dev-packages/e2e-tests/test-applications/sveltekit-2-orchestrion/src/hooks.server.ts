import { E2E_TEST_DSN } from '$env/static/private';
import * as Sentry from '@sentry/sveltekit';

// Opt into diagnostics-channel-based auto-instrumentation. This registers the
// channel subscribers (e.g. for mysql and ioredis) that turn the
// diagnostics-channel events — injected at build time by the orchestrion Vite
// plugin (see vite.config.ts) — into Sentry spans. Must run before Sentry.init().
Sentry.experimentalUseDiagnosticsChannelInjection();

Sentry.init({
  traceLifecycle: 'static',
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
});

// not logging anything to console to avoid noise in the test output
export const handleError = Sentry.handleErrorWithSentry(() => {});

export const handle = Sentry.sentryHandle();
