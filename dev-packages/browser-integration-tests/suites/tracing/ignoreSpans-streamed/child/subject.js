Sentry.startSpan({ name: 'parent-span' }, () => {
  Sentry.startSpan({ name: 'keep-me' }, () => {});

  // This child matches ignoreSpans —> dropped
  Sentry.startSpan({ name: 'ignore-child' }, () => {
    // dropped
    Sentry.startSpan({ name: 'ignore-grandchild-1' }, () => {
      // kept
      Sentry.startSpan({ name: 'great-grandchild-1' }, () => {
        // dropped
        Sentry.startSpan({ name: 'ignore-great-great-grandchild-1' }, () => {
          // kept
          Sentry.startSpan({ name: 'great-great-great-grandchild-1' }, () => {});
        });
      });
    });
    // Grandchild is reparented to 'parent-span' —> kept
    Sentry.startSpan({ name: 'grandchild-2' }, () => {});
  });

  // kept
  Sentry.startSpan({ name: 'another-keeper' }, () => {});
});
