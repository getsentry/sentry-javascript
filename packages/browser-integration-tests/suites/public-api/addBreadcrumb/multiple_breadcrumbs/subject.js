Sentry.addBreadcrumb({
  category: 'foo',
  message: 'bar',
  level: 'baz',
});

Sentry.addBreadcrumb({
  category: 'qux',
});

Sentry.captureMessage('test_multi_breadcrumbs');
