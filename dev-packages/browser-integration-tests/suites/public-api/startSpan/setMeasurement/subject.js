Sentry.startSpan({ name: 'some_transaction' }, () => {
  Sentry.setMeasurement('metric.foo', 42, 'ms');
  Sentry.setMeasurement('metric.bar', 1337, 'nanoseconds');
  Sentry.setMeasurement('metric.baz', 99, 's');
  Sentry.setMeasurement('metric.baz', 1, '');
});
