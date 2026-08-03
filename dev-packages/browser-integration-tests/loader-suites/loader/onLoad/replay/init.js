Sentry.onLoad(function () {
  Sentry.init({
    traceLifecycle: 'static',
    replaysSessionSampleRate: 1,
  });
});
