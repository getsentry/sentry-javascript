// This segment span matches ignoreSpans — segment + child should be dropped
Sentry.startSpan({ name: 'ignore-segment' }, () => {
  Sentry.startSpan({ name: 'child-of-ignored-segment' }, () => {});
});

setTimeout(() => {
  // This segment span does NOT match — segment + child should be sent
  Sentry.startSpan({ name: 'normal-segment' }, () => {
    Sentry.startSpan({ name: 'child-span' }, () => {});
  });
}, 1000);
