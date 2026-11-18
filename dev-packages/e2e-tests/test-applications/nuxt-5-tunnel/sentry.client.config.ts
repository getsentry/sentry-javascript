import * as Sentry from '@sentry/nuxt';

Sentry.init({
  dsn: 'http://public@localhost:3031/1337',
  tunnel: true,
  integrations: [Sentry.browserTracingIntegration(), Sentry.vueIntegration({ tracingOptions: { timeout: 500 } })],
  tracesSampleRate: 1,
});
