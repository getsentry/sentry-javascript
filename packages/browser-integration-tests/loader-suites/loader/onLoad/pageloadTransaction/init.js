window._testBaseTimestamp = performance.timeOrigin / 1000;

Sentry.onLoad(() => {
  Sentry.init({});
});
