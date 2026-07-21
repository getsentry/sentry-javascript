Sentry.startSpan({ name: 'standalone_span', experimental: { standalone: true } }, () => {
  fetch('http://sentry-test-external.io');
});
