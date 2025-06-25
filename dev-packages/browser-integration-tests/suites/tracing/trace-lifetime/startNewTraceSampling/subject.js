const newTraceBtn = document.getElementById('newTrace');
newTraceBtn.addEventListener('click', async () => {
  Sentry.startNewTrace(() => {
    // We want to ensure the new trace is sampled, so we force the sample_rand to a value above 0.9
    Sentry.getCurrentScope().setPropagationContext({
      ...Sentry.getCurrentScope().getPropagationContext(),
      sampleRand: 0.85,
    });
    Sentry.startSpan({ op: 'ui.interaction.click', name: 'new-trace' }, async () => {
      await fetch('http://sentry-test-site.example');
    });
  });
});
