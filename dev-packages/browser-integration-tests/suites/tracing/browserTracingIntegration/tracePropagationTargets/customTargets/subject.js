fetch('http://sentry-test-site.io/0').then(
  fetch('http://sentry-test-site.io/1').then(fetch('http://sentry-test-site.io/2')),
);
