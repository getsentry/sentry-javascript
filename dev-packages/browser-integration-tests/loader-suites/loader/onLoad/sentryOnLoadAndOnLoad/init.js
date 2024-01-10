Sentry.onLoad(function () {
  // this should be called _after_ window.sentryOnLoad
  Sentry.captureException(`Test exception: ${Sentry.getClient().getOptions().tracesSampleRate}`);
});
