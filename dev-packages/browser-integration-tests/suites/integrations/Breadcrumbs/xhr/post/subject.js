const xhr = new XMLHttpRequest();

xhr.open('POST', 'http://localhost:7654/foo');
xhr.setRequestHeader('Accept', 'application/json');
xhr.setRequestHeader('Content-Type', 'application/json');
xhr.send('{"my":"body"}');

xhr.addEventListener('readystatechange', function () {
  if (xhr.readyState === 4) {
    Sentry.captureException('test error');
  }
});
