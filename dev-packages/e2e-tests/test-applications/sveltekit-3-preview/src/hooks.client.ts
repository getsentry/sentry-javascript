import { PUBLIC_E2E_TEST_DSN } from '$app/env/public';
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: PUBLIC_E2E_TEST_DSN,
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1.0,
});
