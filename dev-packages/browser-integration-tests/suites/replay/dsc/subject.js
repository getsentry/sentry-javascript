import * as Sentry from '@sentry/browser';

window._triggerError = function (errorCount) {
  Sentry.captureException(new Error(`This is error #${errorCount}`));
};
