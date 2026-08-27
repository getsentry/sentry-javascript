import type * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Simulate the vendored code-transformer chain. A tree-shaken build (this package bundled into an
// app and stripped) throws a `TypeError` from `create(...).getTransformer(...).transform(...)`; a
// healthy build does not. See `isTransformerTreeShaken` in `runtime/register.ts`.
const createMock = vi.fn();
vi.mock('@apm-js-collab/code-transformer', () => ({
  create: (...args: unknown[]) => createMock(...args),
}));

// Neutralise `consoleSandbox` (it swaps in the pristine console during its callback, which would
// bypass a spy) so we can assert the always-on warning directly.
vi.mock('@sentry/core', async importOriginal => {
  const actual = await importOriginal<typeof SentryCore>();
  return { ...actual, consoleSandbox: (cb: () => unknown) => cb() };
});

import { GLOBAL_OBJ } from '@sentry/core';
import { registerDiagnosticsChannelInjection } from '../../src/orchestrion/runtime/register';

describe('registerDiagnosticsChannelInjection - bundled/tree-shaken detection', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
    createMock.mockReset();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
    warnSpy.mockRestore();
  });

  it('warns once and disables runtime injection when the transformer was tree-shaken', () => {
    // A tree-shaken chain: `parse`/`generate` are `undefined`, so a transform throws a TypeError.
    createMock.mockImplementation(() => {
      throw new TypeError('parse is not a function');
    });

    registerDiagnosticsChannelInjection();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('was bundled into your application'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('docs.sentry.io'));
    // Marked unavailable, and NOT marked as runtime-hooked (hooks were never installed).
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.runtimeUnavailable).toBe(true);
    expect(GLOBAL_OBJ.__SENTRY_ORCHESTRION__?.runtime).toBeUndefined();
  });

  it('does not warn again on subsequent calls (deduped)', () => {
    createMock.mockImplementation(() => {
      throw new TypeError('parse is not a function');
    });

    registerDiagnosticsChannelInjection();
    registerDiagnosticsChannelInjection();
    registerDiagnosticsChannelInjection();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    // The probe runs only on the first call; the marker short-circuits the rest.
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
