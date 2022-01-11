Sentry.configureScope(scope => {
  scope.setTag('foo', 'bar');
  scope.setUser({ id: 'baz' });
  scope.setExtra('qux', 'quux');
  scope.clear();
});

Sentry.captureMessage('cleared_scope');
