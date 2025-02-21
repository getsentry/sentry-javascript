Sentry.withScope(() => {
  Sentry.startSpan({ name: 'test_span_1' }, () => undefined);
  Sentry.startSpan({ name: 'test_span_2' }, () => undefined);
});
