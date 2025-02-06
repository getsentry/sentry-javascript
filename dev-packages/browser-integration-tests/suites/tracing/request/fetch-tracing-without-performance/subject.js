fetch('http://sentry-test-site.io/0').then(
  fetch('http://sentry-test-site.io/1', { headers: { 'X-Test-Header': 'existing-header' } }).then(
    fetch('http://sentry-test-site.io/2'),
  ),
);
