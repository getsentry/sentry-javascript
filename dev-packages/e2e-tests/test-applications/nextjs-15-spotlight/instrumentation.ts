export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      environment: 'qa',
      dsn: process.env.E2E_TEST_DSN,
      tunnel: `http://localhost:3031/`,
      tracesSampleRate: 1.0,
    });
  }
}

