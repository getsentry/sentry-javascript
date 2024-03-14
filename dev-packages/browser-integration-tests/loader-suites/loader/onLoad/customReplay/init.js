Sentry.onLoad(function () {
  Sentry.init({
    integrations: [
      // Without this syntax, this will be re-written by the test framework
      window['Sentry'].replayIntegration({
        useCompression: false,
      }),
    ],
  });
});
