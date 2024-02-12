window._testBaseTimestamp = performance.timeOrigin / 1000;

Sentry.onLoad(function () {
  Sentry.init({
    integrations: [
      // Without this syntax, this will be re-written by the test framework
      window['Sentry'].browserTracingIntegration(),
    ],
    tracePropagationTargets: ['http://localhost:1234'],
  });
});
