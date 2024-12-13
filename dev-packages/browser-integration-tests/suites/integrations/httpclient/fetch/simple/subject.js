fetch('http://sentry-test.io/foo', {
  method: 'GET',
  credentials: 'include',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Cache: 'no-cache',
  },
});
