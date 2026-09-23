window.sentryOnLoad = function () {
  Sentry.init({ traceLifecycle: 'static' });

  window.__sentryLoaded = true;
};
