Sentry.getCurrentScope().setPropagationContext({
  parentSpanId: '1234567890123456',
  traceId: '12345678901234567890123456789012',
  sampleRand: Math.random(),
});

Sentry.startSpan({ name: 'test_span_1' }, () => undefined);
Sentry.startSpan({ name: 'test_span_2' }, () => undefined);
