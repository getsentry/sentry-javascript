/**
 * @vitest-environment jsdom
 */

import type { Client } from '@sentry/core';
import { debug } from '@sentry/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

    vi.spyOn(debug, 'warn').mockImplementation((message: unknown) => {
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

  it('does not trigger warning spam when normalizing Vue VNodes with high normalizeDepth', () => {
    // This test reproduces the issue from https://github.com/getsentry/sentry-javascript/issues/18203
    // where VNodes in console arguments would trigger recursive warning spam with captureConsoleIntegration

    Sentry.init({
      dsn: PUBLIC_DSN,
      defaultIntegrations: false,
      normalizeDepth: 10, // High depth that would cause the issue
      integrations: [Sentry.captureConsoleIntegration({ levels: ['warn'] })],
    });

    const initialWarningCount = warnings.length;

    // Create a mock VNode that simulates the problematic behavior from the original issue
    // In the real scenario, accessing VNode properties during normalization would trigger Vue warnings
    // which would then be captured and normalized again, creating a recursive loop
    let propertyAccessCount = 0;
    const mockVNode = {
      __v_isVNode: true,
      __v_skip: true,
      type: {},
      get ctx() {
        // Simulate Vue's behavior where accessing ctx triggers a warning
        propertyAccessCount++;
        // eslint-disable-next-line no-console
        console.warn('[Vue warn]: compilerOptions warning triggered by property access');
        return { uid: 1 };
      },
      get props() {
        propertyAccessCount++;
        return {};
      },
    };

    // Pass the mock VNode to console.warn, simulating what Vue does
    // Without the fix, Sentry would try to normalize mockVNode, access its ctx property,
    // which triggers another warning, which gets captured and normalized, creating infinite recursion
    // eslint-disable-next-line no-console
    console.warn('[Vue warn]: Original warning', mockVNode);

    // With the fix, Sentry detects the VNode early and stringifies it as [VueVNode]
    // without accessing its properties, so propertyAccessCount stays at 0
    expect(propertyAccessCount).toBe(0);

    // Only 1 warning should be captured (the original one)
    // Without the fix, the count would multiply as ctx getter warnings get recursively captured
    const warningCountAfter = warnings.length;
    const newWarnings = warningCountAfter - initialWarningCount;
    expect(newWarnings).toBe(1);
  });
});
