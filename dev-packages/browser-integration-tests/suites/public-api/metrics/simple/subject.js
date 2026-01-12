Sentry.metrics.count('test.counter', 1, { attributes: { endpoint: '/api/test' } });
Sentry.metrics.gauge('test.gauge', 42, { unit: 'millisecond', attributes: { server: 'test-1' } });
Sentry.metrics.distribution('test.distribution', 200, { unit: 'second', attributes: { priority: 'high' } });

Sentry.startSpan({ name: 'test-span', op: 'test' }, () => {
  Sentry.metrics.count('test.span.counter', 1, { attributes: { operation: 'test' } });
});

Sentry.setUser({ id: 'user-123', email: 'test@example.com', username: 'testuser' });
Sentry.metrics.count('test.user.counter', 1, { attributes: { action: 'click' } });

Sentry.withScope(scope => {
  scope.setAttribute('scope_attribute_1', 1);
  scope.setAttributes({ scope_attribute_2: { value: 'test' }, scope_attribute_3: { value: 38, unit: 'gigabyte' } });
  Sentry.metrics.count('test.scope.attributes.counter', 1, { attributes: { action: 'click' } });
});

Sentry.flush();
