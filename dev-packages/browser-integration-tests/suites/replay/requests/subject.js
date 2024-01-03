document.getElementById('go-background').addEventListener('click', () => {
  Object.defineProperty(document, 'hidden', { value: true, writable: true });
  const ev = document.createEvent('Event');
  ev.initEvent('visibilitychange');
  document.dispatchEvent(ev);
});

document.getElementById('fetch').addEventListener('click', () => {
  fetch('https://example.com', { method: 'POST', body: 'foo' });
});

document.getElementById('xhr').addEventListener('click', () => {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', 'https://example.com');
  xhr.send();
});
