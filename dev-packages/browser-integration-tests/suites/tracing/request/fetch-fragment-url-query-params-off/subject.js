document.getElementById('btnFragment').addEventListener('click', async () => {
  await Sentry.startSpan({ name: 'rootSpan' }, () =>
    fetch('http://sentry-test-site.example/callback?id=1#access_token=abc123&state=xyz'),
  );
});
