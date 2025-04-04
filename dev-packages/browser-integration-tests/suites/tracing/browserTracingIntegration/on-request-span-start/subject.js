fetch('http://sentry-test-site-fetch.example/', {
  headers: {
    foo: 'fetch',
  },
});

const xhr = new XMLHttpRequest();

xhr.open('GET', 'http://sentry-test-site-xhr.example/');
xhr.setRequestHeader('foo', 'xhr');
xhr.send();
