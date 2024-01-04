Sentry.onLoad(function () {
  // You _have_ to call Sentry.init() before calling Sentry.captureException() in Sentry.onLoad()!
  Sentry.init();
  Sentry.captureException('Test exception');
});
