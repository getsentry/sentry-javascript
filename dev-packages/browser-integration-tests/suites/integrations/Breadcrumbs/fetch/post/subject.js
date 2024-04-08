fetch('http://localhost:7654/foo', {
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
