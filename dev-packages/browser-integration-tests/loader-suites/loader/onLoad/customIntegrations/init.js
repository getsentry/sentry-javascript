class CustomIntegration {
  constructor() {
    this.name = 'CustomIntegration';
  }

  setupOnce() {}
}

Sentry.onLoad(function () {
  Sentry.init({
    traceLifecycle: 'static',
    integrations: [new CustomIntegration()],
  });

  window.__sentryLoaded = true;
});
