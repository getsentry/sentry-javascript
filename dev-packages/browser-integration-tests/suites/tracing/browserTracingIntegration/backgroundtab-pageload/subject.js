document.getElementById('go-background').addEventListener('click', () => {
  setTimeout(() => {
    Object.defineProperty(document, 'hidden', { value: true, writable: true });
    const ev = document.createEvent('Event');
    ev.initEvent('visibilitychange');
    document.dispatchEvent(ev);
  }, 250);
});
