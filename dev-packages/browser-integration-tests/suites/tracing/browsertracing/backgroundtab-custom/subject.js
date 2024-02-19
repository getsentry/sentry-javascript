document.getElementById('go-background').addEventListener('click', () => {
  Object.defineProperty(document, 'hidden', { value: true, writable: true });
  const ev = document.createEvent('Event');
  ev.initEvent('visibilitychange');
  document.dispatchEvent(ev);
});

document.getElementById('start-transaction').addEventListener('click', () => {
  Sentry.withActiveSpan(null, () => {
    Sentry.startSpan({ name: 'test-transaction' }, span => {
      window.transaction = span;
    });
  });
});
