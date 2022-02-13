Sentry.configureScope(scope => {
  scope.setTag('foo', 'bar');
  scope.setUser({ id: 'baz' });
  scope.setExtra('qux', 'quux');
  scope.setContext('context1', { prop: '1234'});
  scope.setContext('context1', (existingContext) => ({ ...existingContext, anotherProp: { isNested: true }}));
  scope.setContext('context2', { aNewPropForContext2: [1, 2, 3]});
});

Sentry.captureMessage('configured_scope');
