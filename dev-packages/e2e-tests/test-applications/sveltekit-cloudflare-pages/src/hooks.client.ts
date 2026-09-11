import { env } from '$env/dynamic/public';
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: env.PUBLIC_E2E_TEST_DSN,
});

export const handleError = Sentry.handleErrorWithSentry();
