import * as Sentry from '@sentry/nextjs';

Sentry.init({
  environment: 'qa',
  dsn: process.env.SENTRY_DSN,
  tunnel: `http://localhost:3031/`,
  tracesSampleRate: 1.0,
  sendDefaultPii: true,
});
