window._testBaseTimestamp = performance.timeOrigin / 1000;

Sentry.onLoad(() => {
  Sentry.init({
    integrations: [
      // Without this syntax, this will be re-written by the test framework
      new window['Sentry'].BrowserTracing({
        tracePropagationTargets: ['http://localhost:1234'],
      }),
    ],
  });
});
