import * as Sentry from '@sentry/nuxt';

Sentry.init({
  dsn: 'http://public@localhost:3031/1337',
  integrations: [Sentry.serveTunnelIntegration()],
  tracesSampleRate: 1,
});
