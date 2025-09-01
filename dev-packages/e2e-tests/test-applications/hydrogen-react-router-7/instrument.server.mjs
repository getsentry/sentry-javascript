import * as Sentry from '@sentry/react-router';
Sentry.init({
  dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
  // Adds request headers and IP for users, for more info visit:
  // https://docs.sentry.io/platforms/javascript/guides/react-router/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
  tunnel: `http://localhost:3031/`, // proxy server
});
