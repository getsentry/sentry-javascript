import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as SentryCore from '@sentry/core';
import { GLOBAL_OBJ } from '@sentry/core';

// A minimal event bus standing in for the client, plus synchronous binding resolution so the whole
// bundler runtime path (bridge -> event -> listener -> instrumentation callback) runs inline.
const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
const fakeClient = {
  on(hook: string, cb: (...args: unknown[]) => void) {
    (handlers[hook] ??= []).push(cb);
    return () => {
      handlers[hook] = (handlers[hook] ?? []).filter(h => h !== cb);
    };
  },
  emit(hook: string, ...args: unknown[]) {
    (handlers[hook] ?? []).slice().forEach(h => h(...args));
  },
};

vi.mock('@sentry/core', async importOriginal => {
  const actual = await importOriginal<typeof SentryCore>();
  return {
    ...actual,
    getClient: () => fakeClient,
    waitForTracingChannelBinding: (cb: () => void) => cb(),
  };
});

import { invokeOrchestrionInstrumentation } from '../../src/orchestrion/instrumentation';

describe('invokeOrchestrionInstrumentation — bundler runtime path', () => {
  afterEach(() => {
    for (const key of Object.keys(handlers)) {
      handlers[key] = [];
    }
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION_ON_INJECT__;
  });

  it('installs the on-inject bridge during setup', () => {
    invokeOrchestrionInstrumentation(fakeClient as never, ['ioredis'], vi.fn(), []);
    expect(typeof GLOBAL_OBJ.__SENTRY_ORCHESTRION_ON_INJECT__).toBe('function');
  });

  it('subscribes when a build-time injected module announces itself via the bridge', () => {
    const callback = vi.fn();
    invokeOrchestrionInstrumentation(fakeClient as never, ['ioredis'], callback as never, []);

    // Not injected yet at init → callback must not have run.
    expect(callback).not.toHaveBeenCalled();

    // The module's appended prologue calls this on load; it must trigger the subscription.
    GLOBAL_OBJ.__SENTRY_ORCHESTRION_ON_INJECT__?.('ioredis');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('ignores announcements for modules the integration does not handle', () => {
    const callback = vi.fn();
    invokeOrchestrionInstrumentation(fakeClient as never, ['ioredis'], callback as never, []);

    GLOBAL_OBJ.__SENTRY_ORCHESTRION_ON_INJECT__?.('some-other-package');
    expect(callback).not.toHaveBeenCalled();
  });

  it('does not invoke the callback more than once across repeated announcements', () => {
    const callback = vi.fn();
    invokeOrchestrionInstrumentation(fakeClient as never, ['ioredis'], callback as never, []);

    GLOBAL_OBJ.__SENTRY_ORCHESTRION_ON_INJECT__?.('ioredis');
    GLOBAL_OBJ.__SENTRY_ORCHESTRION_ON_INJECT__?.('ioredis');
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
