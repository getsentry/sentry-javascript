class CustomIntegration {
  constructor() {
    this.name = 'CustomIntegration';
  }

  setupOnce() {}
}

Sentry.onLoad(function () {
  Sentry.init({
    traceLifecycle: 'static',
    integrations: integrations => [new CustomIntegration()].concat(integrations),
  });

  window.__sentryLoaded = true;
});
