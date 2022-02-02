document.getElementById('go-background').addEventListener('click', () => {
  Object.defineProperty(document, 'hidden', { value: true, writable: true });
  const ev = document.createEvent('Event');
  ev.initEvent('visibilitychange');
  document.dispatchEvent(ev);
});

document.getElementById('start-transaction').addEventListener('click', () => {
  window.transaction = Sentry.startTransaction({ name: 'test-transaction' });
  Sentry.getCurrentHub().configureScope(scope => scope.setSpan(window.transaction));
});
