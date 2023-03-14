document.getElementById('go-background').addEventListener('click', () => {
  Object.defineProperty(document, 'hidden', { value: true, writable: true });
  const ev = document.createEvent('Event');
  ev.initEvent('visibilitychange');
  document.dispatchEvent(ev);
});

document.getElementById('spa-navigation').addEventListener('click', () => {
  window.history.pushState({}, '', '/spa');
});
