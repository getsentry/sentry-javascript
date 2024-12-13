fetch(new Request('http://sentry-test.io/foo')).then(() => {
  Sentry.captureException('test error');
});
