import { PUBLIC_E2E_TEST_DSN, PUBLIC_E2E_TEST_TUNNEL } from '$app/env/public';
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  environment: 'qa',
  dsn: PUBLIC_E2E_TEST_DSN,
  tunnel: PUBLIC_E2E_TEST_TUNNEL ? true : 'http://localhost:3031/', // proxy server
  tracesSampleRate: 1.0,
});

export const handleError = Sentry.handleErrorWithSentry();
