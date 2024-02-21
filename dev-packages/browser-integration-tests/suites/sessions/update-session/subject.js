document.getElementById('throw-error').addEventListener('click', () => {
  throw new Error('test');
});

document.getElementById('capture-exception').addEventListener('click', () => {
  Sentry.captureException('test');
});
