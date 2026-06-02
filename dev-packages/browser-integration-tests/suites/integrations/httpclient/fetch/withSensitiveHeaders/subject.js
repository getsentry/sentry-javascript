fetch('http://sentry-test.io/foo', {
  method: 'GET',
  credentials: 'include',
  headers: {
    Accept: 'application/json',
    Authorization: 'Bearer super-secret-token-123',
    'Content-Type': 'application/json',
    'X-API-Key': 'my-api-key-456',
    'X-Custom-Header': 'safe-value',
  },
});
