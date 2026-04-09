fetch('http://sentry-test-site.example/0').then(
  fetch('http://sentry-test-site.example/1', { headers: { 'X-Test-Header': 'existing-header' } }).then(
    fetch('http://sentry-test-site.example/2'),
  ),
);
