window.addEventListener('error', event => {
  Sentry.captureException(event);
});

window.thisDoesNotExist();
