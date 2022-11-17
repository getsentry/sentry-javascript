import { createApp } from 'vue';

import * as Sentry from './../../src';

describe('Sentry.init', () => {
  let _consoleWarn: any;
  let warnings: string[] = [];

  beforeEach(() => {
    warnings = [];
    // eslint-disable-next-line no-console
    _consoleWarn = console.warn;
    // eslint-disable-next-line no-console
    console.warn = jest.fn((message: string) => {
      warnings.push(message);
    });
  });

  afterEach(() => {
    // eslint-disable-next-line no-console
    console.warn = _consoleWarn;
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
});
