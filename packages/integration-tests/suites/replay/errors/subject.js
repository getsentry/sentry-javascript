document.getElementById('go-background').addEventListener('click', () => {
  Object.defineProperty(document, 'hidden', { value: true, writable: true });
  const ev = document.createEvent('Event');
  ev.initEvent('visibilitychange');
  document.dispatchEvent(ev);
});

document.getElementById('error').addEventListener('click', () => {
  throw new Error('Ooops');
});

document.getElementById('drop').addEventListener('click', () => {
  throw new Error('[drop] Ooops');
});

document.getElementById('log').addEventListener('click', () => {
  console.log('Some message');
});
