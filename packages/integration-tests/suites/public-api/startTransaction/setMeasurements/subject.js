const transaction = Sentry.startTransaction({ name: 'some_transaction' });

transaction.setMeasurements({
  'metric.foo': { value: 42, unit: 'ms' },
  'metric.bar': { value: 1337, unit: 'nanoseconds' },
  'metric.baz': { value: 99, unit: 's' },
});

transaction.setMeasurements({
  'metric.bar': { value: 1337, unit: 'nanoseconds' },
  'metric.baz': { value: 1, unit: '' },
});

transaction.finish();
