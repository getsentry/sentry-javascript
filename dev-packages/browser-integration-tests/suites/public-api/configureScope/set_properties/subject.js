Sentry.configureScope(scope => {
  scope.setTag('foo', 'bar');
  scope.setUser({ id: 'baz' });
  scope.setExtra('qux', 'quux');
});

Sentry.captureMessage('configured_scope');
