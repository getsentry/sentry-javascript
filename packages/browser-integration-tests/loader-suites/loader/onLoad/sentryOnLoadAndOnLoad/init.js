Sentry.onLoad(() => {
  // this should be called _after_ window.sentryOnLoad
  Sentry.captureException(`Test exception: ${Sentry.getCurrentHub().getClient().getOptions().tracesSampleRate}`);
});
