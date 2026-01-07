import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Server-side Sentry init
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
      tracesSampleRate: 1.0,
      debug: true,
      environment: 'qa',
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    // Edge runtime Sentry init
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
      tracesSampleRate: 1.0,
      debug: true,
      environment: 'qa',
    });
  }
}
