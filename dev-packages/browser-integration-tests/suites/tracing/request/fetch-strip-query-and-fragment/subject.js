function withRootSpan(cb) {
  return Sentry.startSpan({ name: 'rootSpan' }, cb);
}

document.getElementById('btnQuery').addEventListener('click', async () => {
  await withRootSpan(() => fetch('http://sentry-test-site.example/0?id=123;page=5'));
});

document.getElementById('btnFragment').addEventListener('click', async () => {
  await withRootSpan(() => fetch('http://sentry-test-site.example/1#fragment'));
});

document.getElementById('btnQueryFragment').addEventListener('click', async () => {
  await withRootSpan(() => fetch('http://sentry-test-site.example/2?id=1#fragment'));
});

document.getElementById('btnQueryFragmentSameOrigin').addEventListener('click', async () => {
  await withRootSpan(() => fetch('/api/users?id=1#fragment'));
});
