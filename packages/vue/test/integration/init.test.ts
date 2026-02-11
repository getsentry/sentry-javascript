/**
 * @vitest-environment jsdom
 */

import type { Client } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from 'vue';
import type { Options } from '../../src/types';
import * as Sentry from './../../src';

const PUBLIC_DSN = 'https://username@domain/123';

describe('Sentry.init', () => {
  let warnings: unknown[] = [];

  beforeEach(() => {
    warnings = [];
    vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(message);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      '[@sentry/vue]: Misconfigured SDK. Vue specific errors will not be captured. Update your `Sentry.init` call with an appropriate config option: `app` (Application Instance - Vue 3) or `Vue` (Vue Constructor - Vue 2).',
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

  it('returns client from init', () => {
    expect(runInit({})).not.toBeUndefined();
  });
});

function runInit(options: Partial<Options>): Client | undefined {
  const integration = Sentry.vueIntegration();

  return Sentry.init({
    dsn: PUBLIC_DSN,
    defaultIntegrations: false,
    integrations: [integration],
    ...options,
  });
}
