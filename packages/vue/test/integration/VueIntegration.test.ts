/**
 * @vitest-environment jsdom
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '@sentry/core';
import type { Client } from '@sentry/core';
import { createApp } from 'vue';

import * as Sentry from '../../src';

const PUBLIC_DSN = 'https://username@domain/123';

describe('Sentry.VueIntegration', () => {
  let loggerWarnings: unknown[] = [];
  let warnings: unknown[] = [];

  const globalFetch = globalThis.fetch;
  const globalResponse = globalThis.Response;
  const globalRequest = globalThis.Request;

  beforeAll(() => {
    globalThis.fetch = vi.fn();
    // @ts-expect-error This is a mock
    globalThis.Response = vi.fn();
    globalThis.Request = vi.fn();
  });

  afterAll(() => {
    globalThis.fetch = globalFetch;
    globalThis.Response = globalResponse;
    globalThis.Request = globalRequest;
  });

  beforeEach(() => {
    warnings = [];
    loggerWarnings = [];

    vi.spyOn(logger, 'warn').mockImplementation((message: unknown) => {
      loggerWarnings.push(message);
    });

    vi.spyOn(console, 'warn').mockImplementation((message: unknown) => {
      warnings.push(message);
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('allows to initialize integration later', () => {
    Sentry.init({
      dsn: PUBLIC_DSN,
      defaultIntegrations: false,
    });

    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    // This would normally happen through client.addIntegration()
    const integration = Sentry.vueIntegration({ app });
    integration['setup']?.(Sentry.getClient() as Client);

    app.mount(el);

    expect(warnings).toEqual([]);
    expect(loggerWarnings).toEqual([]);

    expect(app.config.errorHandler).toBeDefined();
  });

  it('warns when mounting before SDK.VueIntegration', () => {
    Sentry.init({
      dsn: PUBLIC_DSN,
      defaultIntegrations: false,
    });

    const el = document.createElement('div');
    const app = createApp({
      template: '<div>hello</div>',
    });

    app.mount(el);

    // This would normally happen through client.addIntegration()
    const integration = Sentry.vueIntegration({ app });
    integration['setup']?.(Sentry.getClient() as Client);

    expect(warnings).toEqual([
      '[@sentry/vue]: Misconfigured SDK. Vue app is already mounted. Make sure to call `app.mount()` after `Sentry.init()`.',
    ]);
    expect(loggerWarnings).toEqual([]);
  });
});
