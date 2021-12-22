try {
  throw Error('test_simple_error');
} catch (err) {
  Sentry.captureException(err);
}
