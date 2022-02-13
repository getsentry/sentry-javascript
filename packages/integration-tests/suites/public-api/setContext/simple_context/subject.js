Sentry.setContext('foo', { bar: 'baz' });
Sentry.setContext('foo', existingContext => ({
  ...existingContext,
  qux: '6789',
}));
Sentry.captureMessage('simple_context_object');
