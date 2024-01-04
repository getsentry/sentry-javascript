Sentry.forceLoad();

setTimeout(() => {
  Sentry.onLoad(function () {
    Sentry.captureException('Test exception');
  });
}, 200);
