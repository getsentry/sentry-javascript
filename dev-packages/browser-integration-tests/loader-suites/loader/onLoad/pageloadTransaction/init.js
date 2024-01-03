window._testBaseTimestamp = performance.timeOrigin / 1000;

Sentry.onLoad(function () {
  Sentry.init({});
});
