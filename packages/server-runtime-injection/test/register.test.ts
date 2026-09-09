import type * as SentryCore from '@sentry/core';
import type * as NodeModule from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The registration installs real Node module hooks, which we neither want nor need here. Stub the
// tracing-hooks surface so the tests can drive the diagnostics callback directly, and neuter
// `node:module`'s hook installers: on Node 24.13+/26 the stable-sync-hooks path would otherwise call
// the real `Module.registerHooks({ resolve, load })` with the mocked (undefined-returning) callbacks,
// leaving a broken resolve hook installed process-wide that crashes vitest's next dynamic `import()`.
vi.mock('node:module', async importOriginal => {
  const actual = await importOriginal<typeof NodeModule>();
  return { ...actual, registerHooks: vi.fn(), register: vi.fn() };
});

const setDiagnosticsHookMock = vi.fn<(cb: DiagnosticsCallback) => void>();
vi.mock('@apm-js-collab/tracing-hooks/lib/diagnostics.js', () => ({
  setDiagnosticsHook: (cb: DiagnosticsCallback) => setDiagnosticsHookMock(cb),
}));
vi.mock('@apm-js-collab/tracing-hooks', () => ({
  default: class {
    patch(): void {}
  },
}));
vi.mock('@apm-js-collab/tracing-hooks/hook-sync.mjs', () => ({
  initialize: vi.fn(),
  load: vi.fn(),
  resolve: vi.fn(),
  createDiagnosticsPort: vi.fn(),
}));

// Neutralise `consoleSandbox` (it swaps in the pristine console during its callback, which would
// bypass a spy) so we can assert the always-on warning directly.
vi.mock('@sentry/core', async importOriginal => {
  const actual = await importOriginal<typeof SentryCore>();
  return { ...actual, consoleSandbox: (cb: () => unknown) => cb() };
});

import { GLOBAL_OBJ } from '@sentry/core';
import { registerDiagnosticsChannelInjection } from '../src/register';

type DiagnosticsCallback = (event: { moduleName: string; error?: unknown }) => void;

describe('registerDiagnosticsChannelInjection - bundled/tree-shaken detection', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  /**
   * The bundling warnings only. Registration itself can warn for unrelated reasons in this
   * environment (Node's module-hook APIs are not stubbed), which is not what these tests assert on.
   */
  function bundlingWarnings(): string[] {
    return warnSpy.mock.calls.map(([message]) => String(message)).filter(m => m.includes('was bundled into'));
  }

  /** The isolated per-module failure warnings only (a transform failure that is not a stripped transformer). */
  function moduleFailureWarnings(): string[] {
    return warnSpy.mock.calls.map(([message]) => String(message)).filter(m => m.includes('Could not instrument'));
  }

  /** The callback the registration handed to tracing-hooks. */
  function diagnosticsCallback(): DiagnosticsCallback {
    const [callback] = setDiagnosticsHookMock.mock.lastCall ?? [];
    if (!callback) {
      throw new Error('registerDiagnosticsChannelInjection() did not install a diagnostics hook');
    }
    return callback;
  }

  beforeEach(async () => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
    setDiagnosticsHookMock.mockClear();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // The one-warning-per-process flag is module state, so each test needs a fresh module.
    vi.resetModules();
  });

  afterEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
    warnSpy.mockRestore();
  });

  it('warns once when a module fails to transform because the transformer was tree-shaken', () => {
    registerDiagnosticsChannelInjection();
    const onDiagnostics = diagnosticsCallback();

    // A tree-shaken chain: `parse`/`generate` are `undefined`, so the transform throws a TypeError.
    onDiagnostics({ moduleName: 'mysql2', error: new TypeError('parse is not a function') });
    onDiagnostics({ moduleName: 'pg', error: new TypeError('parse is not a function') });

    expect(bundlingWarnings()).toHaveLength(1);
    expect(bundlingWarnings()[0]).toContain('mysql2');
    expect(bundlingWarnings()[0]).toContain('docs.sentry.io');
    // The underlying error is surfaced so the warning is self-diagnosing.
    expect(bundlingWarnings()[0]).toContain('parse is not a function');
  });

  it('reports a non-stripped transform TypeError as an isolated failure, not bundling', () => {
    registerDiagnosticsChannelInjection();

    // `transform is not a function` (a config operator not registered at runtime) is not the
    // stripped-parser fingerprint, so even as the first and only failing module it must not be
    // blamed on bundling.
    diagnosticsCallback()({ moduleName: 'lib-op-missing', error: new TypeError('transform is not a function') });

    expect(bundlingWarnings()).toEqual([]);
    expect(moduleFailureWarnings()).toHaveLength(1);
    expect(moduleFailureWarnings()[0]).toContain('lib-op-missing');
    expect(moduleFailureWarnings()[0]).toContain('transform is not a function');
  });

  it('treats a stripped-parser error as isolated once another module has been instrumented', () => {
    registerDiagnosticsChannelInjection();
    const onDiagnostics = diagnosticsCallback();

    // A successful transform proves the transformer works, so a later `parse is not a function`
    // cannot be a tree-shaken transformer — it is isolated to that module.
    onDiagnostics({ moduleName: 'lib-ok' });
    onDiagnostics({ moduleName: 'lib-guarded', error: new TypeError('parse is not a function') });

    expect(bundlingWarnings()).toEqual([]);
    expect(moduleFailureWarnings()).toHaveLength(1);
    expect(moduleFailureWarnings()[0]).toContain('lib-guarded');
  });

  it('warns once per module for isolated failures', () => {
    registerDiagnosticsChannelInjection();
    const onDiagnostics = diagnosticsCallback();

    onDiagnostics({ moduleName: 'lib-dup', error: new TypeError('transform is not a function') });
    onDiagnostics({ moduleName: 'lib-dup', error: new TypeError('transform is not a function') });
    onDiagnostics({ moduleName: 'lib-other', error: new TypeError('transform is not a function') });

    expect(moduleFailureWarnings()).toHaveLength(2);
  });

  it('stays quiet for transform failures that are not a stripped transformer', () => {
    registerDiagnosticsChannelInjection();

    diagnosticsCallback()({ moduleName: 'mysql2', error: new Error('Failed to find injection points') });

    expect(bundlingWarnings()).toEqual([]);
  });

  it('does not warn when modules transform successfully', () => {
    registerDiagnosticsChannelInjection();
    const onDiagnostics = diagnosticsCallback();

    onDiagnostics({ moduleName: 'mysql2' });

    expect(bundlingWarnings()).toEqual([]);
    // The module is recorded so channel integrations know to subscribe.
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.runtime).toEqual(['mysql2']);
  });

  it('installs hooks only once', () => {
    registerDiagnosticsChannelInjection();
    registerDiagnosticsChannelInjection();

    expect(setDiagnosticsHookMock).toHaveBeenCalledTimes(1);
  });
});
