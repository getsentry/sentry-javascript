window.sentryOnLoad = function () {
  Sentry.init({});

  window.__sentryLoaded = true;
};
