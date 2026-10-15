import * as Sentry from '@sentry/nextjs';

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      environment: 'qa', // dynamic sampling bias to keep transactions
      // The tunnel forwards to the DSN host, so the tunnel variant points it at the event proxy
      dsn: process.env.NEXT_PUBLIC_E2E_TUNNEL
        ? 'http://public@localhost:3031/1337'
        : process.env.NEXT_PUBLIC_E2E_TEST_DSN,
      tunnel: process.env.NEXT_PUBLIC_E2E_TUNNEL ? undefined : `http://localhost:3031/`, // proxy server
      tracesSampleRate: 1.0,
      transportOptions: {
        // We are doing a lot of events at once in this test
        bufferSize: 1000,
      },
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
