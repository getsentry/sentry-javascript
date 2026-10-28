Sentry.startSpan({ name: 'parent-span', op: 'test' }, () => {
  Sentry.startSpan({ name: 'child-span', op: 'test-child' }, () => {
    // noop
  });
});

window.Sentry.captureException(new Error('test error'));
