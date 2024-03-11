const transaction = Sentry.startInactiveSpan({
  name: 'some_transaction',
  forceTransaction: true,
});

transaction.setMeasurement('metric.foo', 42, 'ms');
transaction.setMeasurement('metric.bar', 1337, 'nanoseconds');
transaction.setMeasurement('metric.baz', 99, 's');
transaction.setMeasurement('metric.baz', 1);

transaction.end();
