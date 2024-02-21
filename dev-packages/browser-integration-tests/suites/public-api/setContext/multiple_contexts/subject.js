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

Sentry.captureMessage('multiple_contexts');
