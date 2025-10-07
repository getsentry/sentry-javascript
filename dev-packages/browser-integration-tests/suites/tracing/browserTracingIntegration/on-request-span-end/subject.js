fetch('http://sentry-test.io/fetch', {
  headers: {
    foo: 'fetch',
  },
});

const xhr = new XMLHttpRequest();

xhr.open('GET', 'http://sentry-test.io/xhr');
xhr.setRequestHeader('foo', 'xhr');
xhr.send();
