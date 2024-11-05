async function run() {
  Sentry.startSpan({ name: 'parent_span' }, () => {
    Sentry.startSpan({ name: 'child_span', attributes: { someAttribute: '' } }, () => {
      // whatever a user would do here
    });
  });
}

(async () => {
  await run();
})();
