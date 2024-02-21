window.addEventListener('error', function (event) {
  Sentry.captureException(event);
});

window.thisDoesNotExist();
