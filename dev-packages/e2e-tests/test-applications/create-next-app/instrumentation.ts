import * as Sentry from '@sentry/nextjs';

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      environment: 'qa', // dynamic sampling bias to keep transactions
      dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
      // Adjust this value in production, or use tracesSampler for greater control
      tracesSampleRate: 1.0,
      tunnel: 'http://localhost:3031',
    });
  }
}
