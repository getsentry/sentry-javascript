import * as Sentry from '@sentry/vinext';

export async function register() {
  Sentry.init({
    environment: 'qa',
    dsn: process.env.E2E_TEST_DSN,
    tunnel: 'http://localhost:3031/',
    tracesSampleRate: 1,
    transportOptions: {
      bufferSize: 1000,
    },
  });
}

export const onRequestError = Sentry.captureRequestError;
