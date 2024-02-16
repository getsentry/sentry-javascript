setTimeout(() => {
  Sentry.captureMessage(`foo ${Math.random()}`);
}, 500);
