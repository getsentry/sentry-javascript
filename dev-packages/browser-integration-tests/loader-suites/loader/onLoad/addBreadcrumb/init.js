Sentry.onLoad(function () {
  Sentry.init({ traceLifecycle: 'static' });
  Sentry.addBreadcrumb({
    category: 'auth',
    message: 'testing loader',
    level: 'error',
  });
});
