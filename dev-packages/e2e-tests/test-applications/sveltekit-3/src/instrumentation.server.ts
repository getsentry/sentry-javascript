import { E2E_TEST_DSN } from '$env/static/private';
import * as Sentry from '@sentry/sveltekit';

// With SvelteKit 3 native instrumentation enabled (`experimental.instrumentation.server`),
// `Sentry.init` runs here instead of in `hooks.server.ts`.
Sentry.init({
  environment: 'qa', // dynamic sampling bias to keep transactions
  dsn: E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: `http://localhost:3031/`, // proxy server
  tracesSampleRate: 1.0,
});
