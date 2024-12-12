Sentry.onLoad(function () {
  Sentry.init({});
  Sentry.addBreadcrumb({
    category: 'auth',
    message: 'testing loader',
    level: 'error',
  });
});
