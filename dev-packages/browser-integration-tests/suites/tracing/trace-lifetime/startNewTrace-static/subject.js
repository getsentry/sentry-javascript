const newTraceBtn = document.getElementById('newTrace');
newTraceBtn.addEventListener('click', async () => {
  Sentry.startNewTrace(() => {
    Sentry.startSpan({ op: 'ui.interaction.click', name: 'new-trace' }, async () => {
      await fetch('http://sentry-test-site.example');
    });
  });
});

const oldTraceBtn = document.getElementById('oldTrace');
oldTraceBtn.addEventListener('click', async () => {
  Sentry.startSpan({ op: 'ui.interaction.click', name: 'old-trace' }, async () => {
    await fetch('http://sentry-test-site.example');
  });
});
