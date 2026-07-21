const fetchButton = document.getElementById('fetch');

fetchButton.addEventListener('click', async () => {
  await Sentry.startSpan({ name: 'ignored-click-listener', op: 'ui.interaction.click' }, async () => {
    await fetch('http://sentry-test-external.io');
  });
});

fetchButton.click();
