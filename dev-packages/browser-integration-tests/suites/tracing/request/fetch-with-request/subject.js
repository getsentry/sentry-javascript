const request = new Request('http://sentry-test-site.io/api/test/', {
  headers: { foo: '11' },
});

fetch(request, {
  headers: { bar: '22' },
});
