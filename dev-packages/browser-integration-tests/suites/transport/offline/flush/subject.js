setTimeout(() => {
  Sentry.captureMessage(`foo ${Math.random()}`);
}, 500);

setTimeout(() => {
  Sentry.flush();
}, 2000);
