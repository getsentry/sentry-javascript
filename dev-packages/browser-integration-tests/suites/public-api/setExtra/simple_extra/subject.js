Sentry.setExtra('simple_extra', {
  foo: 'bar',
  baz: {
    qux: 'quux',
  },
});

Sentry.captureMessage('simple_extra');
