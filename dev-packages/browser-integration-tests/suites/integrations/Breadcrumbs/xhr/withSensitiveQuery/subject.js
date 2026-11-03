const xhr = new XMLHttpRequest();

xhr.open('GET', 'http://sentry-test.io/foo?token=sensitive-token-value&page=1');
xhr.send();

xhr.addEventListener('readystatechange', function () {
  if (xhr.readyState === 4) {
    Sentry.captureException('test error');
  }
});
