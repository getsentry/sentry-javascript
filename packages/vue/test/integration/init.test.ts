import { createApp } from 'vue';

import * as Sentry from './../../src';

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

    Sentry.init({
      app,
      defaultIntegrations: false,
    });

    app.mount(el);

    expect(warnings).toEqual([]);
  });

  it('does not warn when correctly setup (Vue 2)', () => {
    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    Sentry.init({
      // this is a bit "hacky", but good enough to test what we want
      Vue: app,
      defaultIntegrations: false,
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

    Sentry.init({
      app,
      defaultIntegrations: false,
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

    Sentry.init({
      defaultIntegrations: false,
    });

    app.mount(el);

    expect(warnings).toEqual([
      `[@sentry/vue]: Misconfigured SDK. Vue specific errors will not be captured.
Update your \`Sentry.init\` call with an appropriate config option:
\`app\` (Application Instance - Vue 3) or \`Vue\` (Vue Constructor - Vue 2).`,
    ]);
  });

  it('does not warn when passing app=false', () => {
    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    Sentry.init({
      app: false,
      defaultIntegrations: false,
    });

    app.mount(el);

    expect(warnings).toEqual([]);
  });
});
