fetch('http://sentry-test.io/foo', {
  method: 'POST',
  body: '{"my":"body"}',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Cache: 'no-cache',
  },
}).then(() => {
  Sentry.captureException('test error');
});
