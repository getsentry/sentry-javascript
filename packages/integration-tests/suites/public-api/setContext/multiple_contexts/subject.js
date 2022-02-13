Sentry.setContext('context_1', {
  foo: 'bar',
  baz: {
    qux: 'quux',
  },
});

Sentry.setContext('context_2', {
  1: 'foo',
  bar: false,
});

Sentry.setContext('context_3', null);
Sentry.setContext('context_4');
Sentry.setContext('context_5', NaN);
Sentry.setContext('context_6', Math.PI);
Sentry.setContext('context_7', { prop: 'abcd' });
Sentry.setContext('context_7', existingContext => ({ ...existingContext, anotherProp: 42 }));

Sentry.captureMessage('multiple_contexts');
