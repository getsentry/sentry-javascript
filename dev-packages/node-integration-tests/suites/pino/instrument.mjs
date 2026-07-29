import * as Sentry from '@sentry/node';

Sentry.init({
  traceLifecycle: 'static',
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  tracesSampleRate: 1.0,
  integrations: [Sentry.pinoIntegration({ error: { levels: ['error', 'fatal'] } })],
});
