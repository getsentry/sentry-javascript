Sentry.startSpan({ name: 'parent-span' }, () => {
  Sentry.startSpan({ name: 'keep-me' }, () => {});

  // This child matches ignoreSpans — should be dropped
  Sentry.startSpan({ name: 'ignore-child' }, () => {
    // Grandchild should be reparented to 'parent-span'
    Sentry.startSpan({ name: 'grandchild-1' }, () => {});
    Sentry.startSpan({ name: 'grandchild-2' }, () => {});
  });

  Sentry.startSpan({ name: 'another-keeper' }, () => {});
});
