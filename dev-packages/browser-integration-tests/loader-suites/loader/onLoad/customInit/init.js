window.__sentryOnLoad = 0;

setTimeout(() => {
  Sentry.onLoad(function () {
    window.__hadSentry = window.sentryIsLoaded();

    Sentry.init({
      sampleRate: 0.5,
    });

    window.__sentryOnLoad++;
  });
});

window.sentryIsLoaded = () => {
  const __sentry = window.__SENTRY__;

  // If there is a global __SENTRY__ that means that in any of the callbacks init() was already invoked
  return !!(!(typeof __sentry === 'undefined') && __sentry.version && !!__sentry[__sentry.version]);
};
