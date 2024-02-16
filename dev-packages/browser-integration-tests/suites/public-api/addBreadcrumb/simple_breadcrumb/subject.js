Sentry.addBreadcrumb({
  category: 'foo',
  message: 'bar',
  level: 'baz',
});

Sentry.captureMessage('test');
