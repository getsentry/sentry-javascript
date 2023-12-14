class CustomIntegration {
  constructor() {
    this.name = 'CustomIntegration';
  }

  setupOnce() {}
}

Sentry.onLoad(() => {
  Sentry.init({
    integrations: [new CustomIntegration()],
  });

  window.__sentryLoaded = true;
});
