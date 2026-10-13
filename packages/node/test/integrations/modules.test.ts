import { GLOBAL_OBJ } from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

type GlobalWithModules = typeof GLOBAL_OBJ & { __SENTRY_SERVER_MODULES__?: Record<string, string> };

describe('modulesIntegration', () => {
  afterEach(() => {
    delete (GLOBAL_OBJ as GlobalWithModules).__SENTRY_SERVER_MODULES__;
    vi.resetModules();
  });

  it('includes modules injected onto the global AFTER this module was evaluated (Turbopack ordering)', async () => {
    // Re-evaluate the integration module with no injected global present. This mirrors Turbopack:
    // the instrumentation file's hoisted ESM imports evaluate this module *before* its
    // `globalThis.__SENTRY_SERVER_MODULES__ = {...}` assignment runs. A module-level capture would
    // freeze an empty value here and never see the injection (getsentry/sentry-javascript#19147).
    vi.resetModules();
    const { modulesIntegration } = await import('../../src/integrations/modules');

    // The runtime injection happens only now — after the module is already evaluated.
    (GLOBAL_OBJ as GlobalWithModules).__SENTRY_SERVER_MODULES__ = { '@sentry/turbopack-injected': '1.2.3' };

    const modules = modulesIntegration().getModules?.() ?? {};
    expect(modules['@sentry/turbopack-injected']).toBe('1.2.3');
  });

  it('reads modules already present before evaluation (webpack DefinePlugin / pre-set global)', async () => {
    (GLOBAL_OBJ as GlobalWithModules).__SENTRY_SERVER_MODULES__ = { '@sentry/prebuilt-injected': '4.5.6' };

    vi.resetModules();
    const { modulesIntegration } = await import('../../src/integrations/modules');

    const modules = modulesIntegration().getModules?.() ?? {};
    expect(modules['@sentry/prebuilt-injected']).toBe('4.5.6');
  });
});
