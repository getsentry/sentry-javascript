Sentry.startSpan({ name: 'test-span', op: 'test' }, () => {
  Sentry.startSpan({ name: 'test-child-span', op: 'test-child' }, () => {
    // noop
  });

  const inactiveSpan = Sentry.startInactiveSpan({ name: 'test-inactive-span' });
  inactiveSpan.end();

  Sentry.startSpanManual({ name: 'test-manual-span' }, (span) => {
    // noop
    span.end();
  });
});
