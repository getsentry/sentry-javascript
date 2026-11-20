import * as Sentry from '../../../build/esm/index.js';

Sentry.init({
  dsn: 'https://username@domain/123',
  defaultIntegrations: false,
  integrations: [Sentry.modulesIntegration()],
  beforeSend(event) {
    // oxlint-disable-next-line no-console
    console.log(JSON.stringify(event.modules));
    return null;
  },
});

Sentry.captureException(new Error('test'));
await Sentry.flush();
