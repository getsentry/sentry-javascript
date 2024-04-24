Sentry.addBreadcrumb({
  category: 'auth',
  message: 'testing loader',
  level: 'error',
});
Sentry.captureMessage('test');
