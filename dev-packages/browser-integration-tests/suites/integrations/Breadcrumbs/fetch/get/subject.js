const xhr = new XMLHttpRequest();

fetch('http://localhost:7654/foo')
  .then(res => res.text())
  .then(() => {
    Sentry.captureException('test error');
  });
