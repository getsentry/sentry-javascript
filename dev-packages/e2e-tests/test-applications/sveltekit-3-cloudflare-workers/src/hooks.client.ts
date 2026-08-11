import { PUBLIC_E2E_TEST_DSN } from '$app/env/public';
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  traceLifecycle: 'static',
  environment: 'qa',
  dsn: PUBLIC_E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
});

export const handleError = Sentry.handleErrorWithSentry();
