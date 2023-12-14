class CustomIntegration {
  constructor() {
    this.name = 'CustomIntegration';
  }

  setupOnce() {}
}

Sentry.onLoad(() => {
  Sentry.init({
    integrations: integrations => [new CustomIntegration()].concat(integrations),
  });

  window.__sentryLoaded = true;
});
