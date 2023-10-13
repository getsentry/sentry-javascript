import { createApp } from 'vue';

import { VueIntegration } from '../../src/integration';
import type { Options } from '../../src/types';
import * as Sentry from './../../src';

const PUBLIC_DSN = 'https://username@domain/123';

describe('Sentry.init', () => {
  let warnings: unknown[] = [];

  beforeEach(() => {
    warnings = [];
    jest.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(message);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not warn when correctly setup (Vue 3)', () => {
    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    runInit({
      app,
    });

    app.mount(el);

    expect(warnings).toEqual([]);
  });

  it('does not warn when correctly setup (Vue 2)', () => {
    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    runInit({
      // this is a bit "hacky", but good enough to test what we want
      Vue: app,
    });

    app.mount(el);

    expect(warnings).toEqual([]);
  });

  it('warns when mounting before SDK init', () => {
    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    app.mount(el);

    runInit({
      app,
    });

    expect(warnings).toEqual([
      '[@sentry/vue]: Misconfigured SDK. Vue app is already mounted. Make sure to call `app.mount()` after `Sentry.init()`.',
    ]);
  });

  it('warns when not passing app & Vue', () => {
    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    runInit({});

    app.mount(el);

    expect(warnings).toEqual([
      `[@sentry/vue]: Misconfigured SDK. Vue specific errors will not be captured.
Update your \`Sentry.init\` call with an appropriate config option:
\`app\` (Application Instance - Vue 3) or \`Vue\` (Vue Constructor - Vue 2).`,
    ]);
  });

  it('does not warn when skipping Vue integration', () => {
    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    Sentry.init({
      dsn: PUBLIC_DSN,
      defaultIntegrations: false,
      integrations: [],
    });

    app.mount(el);

    expect(warnings).toEqual([]);
  });
});

function runInit(options: Partial<Options>): void {
  const hasRunBefore = Sentry.getCurrentHub().getIntegration(VueIntegration);

  const integration = new VueIntegration();

  Sentry.init({
    dsn: PUBLIC_DSN,
    defaultIntegrations: false,
    integrations: [integration],
    ...options,
  });

  // Because our integrations API is terrible to test, we need to make sure to check
  // If we've already had this integration registered before
  // if that's the case, `setup()` will not be run, so we need to manually run it :(
  if (hasRunBefore) {
    integration['_setupIntegration'](Sentry.getCurrentHub());
  }
}
