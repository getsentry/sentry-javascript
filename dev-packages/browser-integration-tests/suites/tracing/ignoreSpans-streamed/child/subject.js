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

  // both dropped
  Sentry.startSpan({ name: 'name-passes-but-op-not-span-1', op: 'ignored-op' }, () => {});
  Sentry.startSpan(
    // sentry.op attribute has precedence over top op argument
    { name: 'name-passes-but-op-not-span-2', op: 'keep', attributes: { 'sentry.op': 'ignored-op' } },
    () => {},
  );

  // kept
  Sentry.startSpan({ name: 'another-keeper' }, () => {});
});
