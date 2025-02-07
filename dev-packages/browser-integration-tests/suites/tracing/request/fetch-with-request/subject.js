const request = new Request('http://sentry-test-site.example/api/test/', {
  headers: { foo: '11' },
});

fetch(request, {
  headers: { bar: '22' },
});
