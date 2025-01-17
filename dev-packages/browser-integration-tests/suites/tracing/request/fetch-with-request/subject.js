const request = new Request('http://example.com/api/test/', {
  headers: { foo: '11' },
});

console.log({ request });

fetch(request, {
  headers: { bar: '22' },
});
