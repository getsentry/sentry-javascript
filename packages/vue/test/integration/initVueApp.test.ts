import { logger } from '@sentry/utils';
import { createApp } from 'vue';

import * as Sentry from '../../src';
import { createTransport, Hub, makeMain } from '../../src';

const PUBLIC_DSN = 'https://username@domain/123';

describe('Sentry.initVueApp', () => {
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

  it('warns when called before SDK.init()', () => {
    const hub = new Hub();
    makeMain(hub);

    const app = createApp({
      template: '<div>hello</div>',
    });

    Sentry.initVueApp(app);

    expect(loggerWarnings).toEqual([
      '[@sentry/vue]: Cannot initialize as no Client available. Make sure to call `Sentry.init` before calling `initVueApp()`.',
    ]);
    expect(warnings).toEqual([]);
  });

  it('warns when mounting before SDK.initVueApp()', () => {
    Sentry.init({ dsn: PUBLIC_DSN, app: false, autoSessionTracking: false });

    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    app.mount(el);

    Sentry.initVueApp(app);

    expect(warnings).toEqual([
      '[@sentry/vue]: Misconfigured SDK. Vue app is already mounted. Make sure to call `app.mount()` after `Sentry.init()`.',
    ]);
    expect(loggerWarnings).toEqual([]);
  });

  it('works when calling SDK.initVueApp()', () => {
    Sentry.init({ dsn: PUBLIC_DSN, app: false, autoSessionTracking: false });

    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    Sentry.initVueApp(app);

    app.mount(el);

    expect(warnings).toEqual([]);
    expect(loggerWarnings).toEqual([]);

    expect(app.config.errorHandler).toBeDefined();
  });

  it('allows to pass a client to SDK.initVueApp()', () => {
    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    const client = new Sentry.BrowserClient({
      dsn: PUBLIC_DSN,
      integrations: [],
      stackParser: () => [],
      transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => Promise.resolve({})),
    });

    Sentry.initVueApp(app, client);

    app.mount(el);

    expect(warnings).toEqual([]);
    expect(loggerWarnings).toEqual([]);

    expect(app.config.errorHandler).toBeDefined();
  });
});
