function withRootSpan(cb) {
  return Sentry.startSpan({ name: 'rootSpan' }, cb);
}

function makeXHRRequest(url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.onload = () => resolve(xhr.responseText);
    xhr.onerror = () => reject(xhr.statusText);
    xhr.send();
  });
}

document.getElementById('btnQuery').addEventListener('click', async () => {
  await withRootSpan(() => makeXHRRequest('http://sentry-test-site.example/0?id=123;page=5'));
});

document.getElementById('btnFragment').addEventListener('click', async () => {
  await withRootSpan(() => makeXHRRequest('http://sentry-test-site.example/1#fragment'));
});

document.getElementById('btnQueryFragment').addEventListener('click', async () => {
  await withRootSpan(() => makeXHRRequest('http://sentry-test-site.example/2?id=1#fragment'));
});

document.getElementById('btnQueryFragmentSameOrigin').addEventListener('click', async () => {
  await withRootSpan(() => makeXHRRequest('/api/users?id=1#fragment'));
});
