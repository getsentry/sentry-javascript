Sentry.startSpan({ name: 'test-span', op: 'test' }, () => {
  Sentry.startSpan({ name: 'test-child-span', op: 'test-child' }, () => {
    // noop
  });

  const inactiveSpan = Sentry.startInactiveSpan({ name: 'test-inactive-span' });
  inactiveSpan.end();

  Sentry.startSpanManual({ name: 'test-manual-span' }, span => {
    // 2 = SPAN_STATUS_ERROR. The message must be preserved as the `sentry.status.message`
    // attribute on the streamed span, since v2 statuses are reduced to ok/error.
    span.setStatus({ code: 2, message: 'Connection Refused' });
    span.end();
  });
});
