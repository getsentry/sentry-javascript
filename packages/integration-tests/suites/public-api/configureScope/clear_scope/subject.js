Sentry.configureScope(scope => {
  scope.setTag('foo', 'bar');
  scope.setUser({id: 'baz'});
  scope.setExtra('qux', 'quux');
  scope.setContext('context1', {prop: '123'})
  scope.setContext('context2', () => ({anotherProp: [1, 2, 3]}))
  scope.clear();
});

Sentry.captureMessage('cleared_scope');
