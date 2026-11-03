import * as Sentry from '@sentry/browser';

/**
 * This simulates an old, pre-v8 SDK setting itself up on the global __SENTRY__ carrier.
 * see: https://github.com/getsentry/sentry-javascript/issues/12155
 */
window.__SENTRY__ = {
  hub: {
    isOlderThan: version => {
      return version < 7;
    },
  },
};

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});
