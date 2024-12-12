async function run() {
  Sentry.startSpan({ name: 'parent_span' }, () => {
    Sentry.startSpan({ name: 'child_span' }, () => {
      // whatever a user would do here
    });

    // unfinished spans are filtered out
    Sentry.startInactiveSpan({ name: 'span_4' });
  });
}

(async () => {
  await run();
})();
