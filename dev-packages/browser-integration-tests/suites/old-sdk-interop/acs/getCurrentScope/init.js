import * as Sentry from '@sentry/browser';

/**
 * This simulates an relatively new v7 SDK setting acs on the __SENTRY__ carrier.
 * see: https://github.com/getsentry/sentry-javascript/issues/12054
 */
window.__SENTRY__ = {
  acs: {
    getCurrentScope: () => {
      return 'scope';
    },
  },
};

window.Sentry = Sentry;

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
});
