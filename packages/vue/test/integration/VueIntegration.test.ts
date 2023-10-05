import { logger } from '@sentry/utils';
import { createApp } from 'vue';

import * as Sentry from '../../src';

const PUBLIC_DSN = 'https://username@domain/123';

describe('Sentry.VueIntegration', () => {
  let loggerWarnings: unknown[] = [];
  let warnings: unknown[] = [];

  beforeEach(() => {
    warnings = [];
    loggerWarnings = [];

    jest.spyOn(logger, 'warn').mockImplementation((message: unknown) => {
      loggerWarnings.push(message);
    });

    jest.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(message);
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('allows to initialize integration later', () => {
    Sentry.init({ dsn: PUBLIC_DSN, defaultIntegrations: false, autoSessionTracking: false });

    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    // This would normally happen through client.addIntegration()
    const integration = new Sentry.VueIntegration({ app });
    integration['_setupIntegration'](Sentry.getCurrentHub());

    app.mount(el);

    expect(warnings).toEqual([]);
    expect(loggerWarnings).toEqual([]);

    expect(app.config.errorHandler).toBeDefined();
  });

  it('warns when mounting before SDK.VueIntegration', () => {
    Sentry.init({ dsn: PUBLIC_DSN, defaultIntegrations: false, autoSessionTracking: false });

    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    app.mount(el);

    // This would normally happen through client.addIntegration()
    const integration = new Sentry.VueIntegration({ app });
    integration['_setupIntegration'](Sentry.getCurrentHub());

    expect(warnings).toEqual([
      '[@sentry/vue]: Misconfigured SDK. Vue app is already mounted. Make sure to call `app.mount()` after `Sentry.init()`.',
    ]);
    expect(loggerWarnings).toEqual([]);
  });
});
