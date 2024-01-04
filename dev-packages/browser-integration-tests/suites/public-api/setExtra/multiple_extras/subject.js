Sentry.setExtra('extra_1', {
  foo: 'bar',
  baz: {
    qux: 'quux',
  },
});

Sentry.setExtra('extra_2', false);

Sentry.captureMessage('multiple_extras');
