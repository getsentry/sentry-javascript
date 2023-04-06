import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

Sentry.onLoad(function () {
  Sentry.captureException('Test exception');
});
