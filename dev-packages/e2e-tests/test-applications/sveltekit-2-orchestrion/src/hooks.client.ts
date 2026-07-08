import { env } from '$env/dynamic/public';
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  environment: 'qa',
  dsn: env.PUBLIC_E2E_TEST_DSN,
  debug: !!env.PUBLIC_DEBUG,
  tunnel: `http://localhost:3031/`,
  tracesSampleRate: 1.0,
});

export const handleError = Sentry.handleErrorWithSentry();
