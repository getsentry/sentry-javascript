Sentry.onLoad(() => {
  Sentry.init({
    integrations: [
      // Without this syntax, this will be re-written by the test framework
      new window['Sentry'].Replay({
        useCompression: false,
      }),
    ],
  });
});
