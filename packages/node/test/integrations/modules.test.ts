import { afterEach, describe, expect, it, vi } from 'vitest';

type GlobalWithModules = typeof globalThis & { __SENTRY_SERVER_MODULES__?: Record<string, string> | string };

describe('modulesIntegration', () => {
  afterEach(() => {
    delete (globalThis as GlobalWithModules).__SENTRY_SERVER_MODULES__;
    vi.resetModules();
  });

  // Without a bundler, the placeholder resolves to the global.
  it('uses the modules that replace `__SENTRY_SERVER_MODULES__` as is', async () => {
    (globalThis as GlobalWithModules).__SENTRY_SERVER_MODULES__ = { '@sentry/build-injected': '1.2.3' };
    const { modulesIntegration } = await import('../../src/integrations/modules');

    expect(modulesIntegration().getModules?.()).toEqual({ '@sentry/build-injected': '1.2.3' });
  });

  it('parses modules that replace `__SENTRY_SERVER_MODULES__` as JSON', async () => {
    (globalThis as GlobalWithModules).__SENTRY_SERVER_MODULES__ = JSON.stringify({ '@sentry/build-injected': '1.2.3' });
    const { modulesIntegration } = await import('../../src/integrations/modules');

    expect(modulesIntegration().getModules?.()).toEqual({ '@sentry/build-injected': '1.2.3' });
  });
});
