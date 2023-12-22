import * as Sentry from '@sentry/browser';
// eslint-disable-next-line no-unused-vars

window.Sentry = Sentry;

Sentry.init({
  // dsn: 'https://public@dsn.ingest.sentry.io/1337',
  dsn: 'https://a5e7debbbe074daa916887a3adcd0df5@o447951.ingest.sentry.io/4503942526795776',
  tracesSampleRate: 1.0,
  normalizeDepth: 10,
});
