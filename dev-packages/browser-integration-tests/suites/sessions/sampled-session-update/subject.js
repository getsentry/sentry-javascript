document.getElementById('throw-error').addEventListener('click', () => {
  throw new Error('unhandled crash');
});

document.getElementById('capture-exception').addEventListener('click', () => {
  Sentry.captureException(new Error('handled capture'));
});
