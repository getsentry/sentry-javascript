document.getElementById('go-background').addEventListener('click', () => {
  Object.defineProperty(document, 'hidden', { value: true, writable: true });
  const ev = document.createEvent('Event');
  ev.initEvent('visibilitychange');
  document.dispatchEvent(ev);
});

document.getElementById('start-span').addEventListener('click', () => {
  const span = Sentry.startBrowserTracingNavigationSpan(Sentry.getClient(), { name: 'test-span' });
  window.span = span;
});

window.getSpanJson = () => {
  return Sentry.spanToJSON(window.span);
};
