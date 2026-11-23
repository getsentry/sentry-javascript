document.getElementById('btnRequest').addEventListener('click', async () => {
  await Sentry.startSpan({ name: 'rootSpan' }, () =>
    fetch('http://sentry-test-site.example/callback?code=abc123&state=xyz#code=def456'),
  );
});
