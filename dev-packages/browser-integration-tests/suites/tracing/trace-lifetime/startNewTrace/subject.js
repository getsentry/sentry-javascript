const fetchBtn = document.getElementById('fetchBtn');
fetchBtn.addEventListener('click', async () => {
  Sentry.startNewTrace();
  Sentry.startSpan({ op: 'ui.interaction.click', name: 'fetch click' }, async () => {
    await fetch('http://example.com');
  });
});
