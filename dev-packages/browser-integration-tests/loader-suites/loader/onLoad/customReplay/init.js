Sentry.onLoad(function () {
  Sentry.init({
    traceLifecycle: 'static',
    integrations: [
      // Without this syntax, this will be re-written by the test framework
      window['Sentry'].replayIntegration({
        useCompression: false,
      }),
    ],

    replaysSessionSampleRate: 1,
  });
});
