try {
  // Create an AggregateError with multiple error objects
  const error1 = new Error('First error message');
  const error2 = new TypeError('Second error message');
  const error3 = new RangeError('Third error message');

  // Create the AggregateError with these errors and a message
  const aggregateError = new AggregateError([error1, error2, error3], 'Multiple errors occurred');

  throw aggregateError;
} catch (err) {
  Sentry.captureException(err);
}
