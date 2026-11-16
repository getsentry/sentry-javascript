import * as Sentry from '@sentry/astro';

Sentry.init({
  dsn: 'http://public@localhost:3031/1337',
  tunnel: true,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1,
});
