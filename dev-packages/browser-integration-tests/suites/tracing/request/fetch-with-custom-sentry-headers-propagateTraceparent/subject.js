fetch('http://sentry-test-site.example/api/test/', {
  headers: { 'sentry-trace': 'abc-123-1', baggage: 'sentry-trace_id=abc', traceparent: '00-abc-123-01' },
});
