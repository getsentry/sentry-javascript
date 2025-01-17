const request = new Request('http://example.com/api/test/', {
  headers: { foo: '11' },
});

fetch(request, {
  headers: { bar: '22' },
});
