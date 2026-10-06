import { env } from '$env/dynamic/public';
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  environment: 'qa',
  dsn: env.PUBLIC_E2E_TEST_DSN,
  tunnel: `http://localhost:3031/`, // proxy server
});

export const handleError = Sentry.handleErrorWithSentry();
