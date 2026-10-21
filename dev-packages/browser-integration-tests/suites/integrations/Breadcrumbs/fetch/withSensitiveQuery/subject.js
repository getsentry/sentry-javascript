fetch('http://sentry-test.io/foo?token=sensitive-token-value&page=1').then(() => {
  Sentry.captureException('test error');
});
