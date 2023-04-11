import * as Sentry from '@sentry/browser';

window.Sentry = Sentry;

class CustomIntegration {
  constructor() {
    this.name = 'CustomIntegration';
  }

  setupOnce() {}
}

Sentry.onLoad(function () {
  Sentry.init({
    integrations: integrations => [new CustomIntegration()].concat(integrations),
  });

  window.__sentryLoaded = true;
});
