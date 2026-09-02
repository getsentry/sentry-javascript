import type { AsyncContextStrategy } from '@sentry/core';
import { GLOBAL_OBJ, setAsyncContextStrategy } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeOrchestrionInstrumentation } from '../../src/orchestrion/instrumentation';

// Minimal async-context strategy exposing a truthy tracing-channel binding, so
// `waitForTracingChannelBinding` inside the helper runs the callback synchronously.
function installBinding(): void {
  setAsyncContextStrategy({
    getTracingChannelBinding: () => ({
      asyncLocalStorage: {},
      getStoreWithActiveSpan: () => ({}) as never,
    }),
  } as unknown as AsyncContextStrategy);
}

// client that emits `orchestrion.module-injected`
function makeClient(): {
  on: (hook: string, cb: (moduleName: string) => void) => () => void;
  inject: (moduleName: string) => void;
  listenerCount: () => number;
} {
  const listeners = new Set<(moduleName: string) => void>();
  return {
    on: (_hook, cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    inject: moduleName => {
      for (const cb of listeners) {
        cb(moduleName);
      }
    },
    listenerCount: () => listeners.size,
  };
}

describe('invokeOrchestrionInstrumentation', () => {
  beforeEach(() => {
    installBinding();
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  afterEach(() => {
    setAsyncContextStrategy(undefined);
    delete GLOBAL_OBJ.__SENTRY_ORCHESTRION__;
  });

  it('subscribes immediately when a module is already injected', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['mysql'] };
    const client = makeClient();
    const callback = vi.fn();

    invokeOrchestrionInstrumentation(client as never, ['mysql'], callback, []);

    expect(callback).toHaveBeenCalledTimes(1);
    // Nothing to wait for, so no listener is registered.
    expect(client.listenerCount()).toBe(0);
  });

  it('does not mark the callback when the binding never becomes available, so a later attempt recovers', async () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['mysql'] };
    // No async-context strategy, so `waitForTracingChannelBinding` finds no binding and gives up.
    setAsyncContextStrategy(undefined);
    const client = makeClient();
    const callback = vi.fn();

    invokeOrchestrionInstrumentation(client as never, ['mysql'], callback, []);

    // Wait past `waitForTracingChannelBinding`'s single ~1ms retry; it bails without subscribing.
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(callback).not.toHaveBeenCalled();

    // The callback must NOT have been marked as instrumented — once the binding exists, a later
    // invocation subscribes rather than being permanently skipped.
    installBinding();
    invokeOrchestrionInstrumentation(client as never, ['mysql'], callback, []);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('subscribes without the binding when requiresTracingChannelBinding is false', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['@hapi/hapi'] };
    // No async-context strategy: integrations that need the binding would bail,
    // but Hapi/KafkaJS/Koa/tedious subscribe directly and must still run.
    setAsyncContextStrategy(undefined);
    const client = makeClient();
    const callback = vi.fn();

    invokeOrchestrionInstrumentation(client as never, ['@hapi/hapi'], callback, [], {
      requiresTracingChannelBinding: false,
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe until the module is injected at runtime', () => {
    const client = makeClient();
    const callback = vi.fn();

    invokeOrchestrionInstrumentation(client as never, ['mysql'], callback, []);

    expect(callback).not.toHaveBeenCalled();
    expect(client.listenerCount()).toBe(1);

    // A different module injecting must not trigger it.
    client.inject('redis');
    expect(callback).not.toHaveBeenCalled();

    // Our module injecting subscribes, exactly once, and removes the listener.
    client.inject('mysql');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(client.listenerCount()).toBe(0);

    client.inject('mysql');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('keeps the listener when the binding is not ready, so a later injection recovers', async () => {
    // No async-context strategy, so the first injection finds no binding.
    setAsyncContextStrategy(undefined);
    const client = makeClient();
    const callback = vi.fn();

    invokeOrchestrionInstrumentation(client as never, ['pg', 'pg-pool'], callback, []);
    expect(client.listenerCount()).toBe(1);

    // First matching injection fires with no binding: the single retry bails,
    // the callback stays unmarked, and the listener must remain for a retry.
    client.inject('pg');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(callback).not.toHaveBeenCalled();
    expect(client.listenerCount()).toBe(1);

    // Binding now available; a later matching injection subscribes.
    installBinding();
    client.inject('pg-pool');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(client.listenerCount()).toBe(0);
  });

  it('matches on any of several module names', () => {
    const client = makeClient();
    const callback = vi.fn();

    invokeOrchestrionInstrumentation(client as never, ['pg', 'pg-pool'], callback, []);
    client.inject('pg-pool');

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('forwards the provided args to the callback', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['mysql'] };
    const client = makeClient();
    const callback = vi.fn();

    invokeOrchestrionInstrumentation(client as never, ['mysql'], callback, ['a', 1]);

    expect(callback).toHaveBeenCalledWith('a', 1);
  });

  it('runs the callback at most once across repeated invocations (dedup by callback)', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { runtime: ['mysql'] };
    const client = makeClient();
    const callback = vi.fn();

    invokeOrchestrionInstrumentation(client as never, ['mysql'], callback, []);
    invokeOrchestrionInstrumentation(client as never, ['mysql'], callback, []);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('treats bundler-recorded modules as injected', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { bundler: new Set(['mysql']) };
    const client = makeClient();
    const callback = vi.fn();

    invokeOrchestrionInstrumentation(client as never, ['mysql'], callback, []);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-Set bundler flag written by a foreign SDK copy', () => {
    GLOBAL_OBJ.__SENTRY_ORCHESTRION__ = { bundler: true as unknown as Set<string> };
    const client = makeClient();
    const callback = vi.fn();

    invokeOrchestrionInstrumentation(client as never, ['mysql'], callback, []);

    // Not treated as injected, so it waits for the runtime event instead.
    expect(callback).not.toHaveBeenCalled();
    expect(client.listenerCount()).toBe(1);
  });
});
