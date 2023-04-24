import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.onLoad(function () {
  Sentry.init({
    integrations: [
      // Without this syntax, this will be re-written by the test framework
      new window['Sentry'].Replay({
        useCompression: false,
      }),
    ],
  });
});
