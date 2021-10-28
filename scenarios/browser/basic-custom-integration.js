import { init } from "@sentry/browser";

class CustomIntegration {
  static id = 'CustomIntegration';

  name = CustomIntegration.id;
  options = undefined;

  constructor(options) {
    this.options = options;
  }

  setupOnce(addGlobalEventProcessor, getCurrentHub) {
    addGlobalEventProcessor(event => event);
    const hub = getCurrentHub();
    hub.captureMessage(options.name);
  }
}

init({
  dsn: "https://00000000000000000000000000000000@o000000.ingest.sentry.io/0000000",
  integrations: [new CustomIntegration()],
});
