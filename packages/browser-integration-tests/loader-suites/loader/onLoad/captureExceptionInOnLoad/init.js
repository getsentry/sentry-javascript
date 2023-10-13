Sentry.onLoad(function () {
  Sentry.init();
  Sentry.captureException('Test exception');
});
