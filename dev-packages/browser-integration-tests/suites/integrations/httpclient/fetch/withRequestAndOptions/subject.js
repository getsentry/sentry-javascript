const request = new Request('http://sentry-test.io/foo', {
  method: 'POST',
  credentials: 'include',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Cache: 'no-cache',
  },
});

fetch(request, {
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Cache: 'cache',
  },
});
