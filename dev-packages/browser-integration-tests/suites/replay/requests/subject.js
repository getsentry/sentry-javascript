document.getElementById('go-background').addEventListener('click', () => {
  Object.defineProperty(document, 'hidden', { value: true, writable: true });
  const ev = document.createEvent('Event');
  ev.initEvent('visibilitychange');
  document.dispatchEvent(ev);
});

document.getElementById('fetch').addEventListener('click', () => {
  fetch('https://sentry-test-site.example', { method: 'POST', body: 'foo' });
});

document.getElementById('xhr').addEventListener('click', () => {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', 'https://sentry-test-site.example');
  xhr.send();
});
