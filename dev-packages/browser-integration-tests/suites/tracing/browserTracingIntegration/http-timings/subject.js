fetch('http://sentry-test-site.example/0').then(
  fetch('http://sentry-test-site.example/1').then(fetch('http://sentry-test-site.example/2')),
);
