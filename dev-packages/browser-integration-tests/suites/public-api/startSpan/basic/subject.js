async function run() {
  Sentry.startSpan({ name: 'parent_span' }, () => {
    Sentry.startSpan({ name: 'child_span' }, () => {
      // whatever a user would do here
    });
  });
}

run();
