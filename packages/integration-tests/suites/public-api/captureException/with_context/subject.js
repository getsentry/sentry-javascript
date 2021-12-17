try {
  undefinedFn();
} catch (err) {
  Sentry.captureException(err, { foo: 'bar' });
}
