import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: '1.0',
  enableLogs: true,
  integrations: [Sentry.pinoIntegration({ error: { levels: ['error', 'fatal'] } })],
});
