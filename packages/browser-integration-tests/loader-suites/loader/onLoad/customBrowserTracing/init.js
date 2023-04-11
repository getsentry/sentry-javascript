import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;
window._testBaseTimestamp = performance.timeOrigin / 1000;

Sentry.onLoad(function () {
  Sentry.init({
    integrations: [
      // Without this syntax, this will be re-written by the test framework
      new window['Sentry'].BrowserTracing({
        tracePropagationTargets: ['http://localhost:1234'],
      }),
    ],
  });
});
