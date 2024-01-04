Sentry.setUser({ id: 'qux' });
Sentry.captureMessage('root_before');

Sentry.withScope(scope => {
  scope.setTag('foo', false);
  Sentry.captureMessage('outer_before');

  Sentry.withScope(scope => {
    scope.setTag('bar', 10);
    scope.setUser(null);
    Sentry.captureMessage('inner');
  });

  scope.setUser({ id: 'baz' });
  Sentry.captureMessage('outer_after');
});

Sentry.captureMessage('root_after');
