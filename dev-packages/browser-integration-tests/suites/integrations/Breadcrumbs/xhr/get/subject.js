const xhr = new XMLHttpRequest();

xhr.open('GET', 'http://localhost:7654/foo');
xhr.send();

xhr.addEventListener('readystatechange', function () {
  if (xhr.readyState === 4) {
    Sentry.captureException('test error');
  }
});
