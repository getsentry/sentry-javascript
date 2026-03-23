// This segment span matches ignoreSpans — should NOT produce a transaction
Sentry.startSpan({ name: 'ignore-segment' }, () => {
  Sentry.startSpan({ name: 'child-of-ignored-segment' }, () => {});
});

setTimeout(() => {
  // This segment span does NOT match — should produce a transaction
  Sentry.startSpan({ name: 'normal-segment' }, () => {
    Sentry.startSpan({ name: 'child-span' }, () => {});
  });
}, 1000);

