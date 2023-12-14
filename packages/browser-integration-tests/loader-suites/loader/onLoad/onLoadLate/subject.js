Sentry.forceLoad();

setTimeout(() => {
  Sentry.onLoad(() => {
    Sentry.captureException('Test exception');
  });
}, 200);
