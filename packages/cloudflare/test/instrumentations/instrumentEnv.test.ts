import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentEnv } from '../../src/instrumentations/worker/instrumentEnv';

vi.mock('../../src/instrumentations/instrumentDurableObjectNamespace', () => ({
  instrumentDurableObjectNamespace: vi.fn((namespace: unknown) => ({
    __instrumented: true,
    __original: namespace,
  })),
  STUB_NON_RPC_METHODS: new Set(['fetch', 'connect', 'dup']),
}));

import { instrumentDurableObjectNamespace } from '../../src/instrumentations/instrumentDurableObjectNamespace';

describe('instrumentEnv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns primitive values unchanged', () => {
    const env = { SENTRY_DSN: 'https://key@sentry.io/123', PORT: 8080, DEBUG: true };
    const instrumented = instrumentEnv(env);

    expect(instrumented.SENTRY_DSN).toBe('https://key@sentry.io/123');
    expect(instrumented.PORT).toBe(8080);
    expect(instrumented.DEBUG).toBe(true);
  });

  it('passes through unknown object bindings unchanged', () => {
    const unknownBinding = { someMethod: () => 'value' };
    const env = { UNKNOWN: unknownBinding };
    const instrumented = instrumentEnv(env);

    expect(instrumented.UNKNOWN).toBe(unknownBinding);
  });

  it('does not instrument DurableObjectNamespace when enableRpcTracePropagation is disabled', () => {
    const doNamespace = {
      idFromName: vi.fn(),
      idFromString: vi.fn(),
      get: vi.fn(),
      newUniqueId: vi.fn(),
    };
    const env = { COUNTER: doNamespace };
    const instrumented = instrumentEnv(env);

    // DO bindings pass through untouched when RPC propagation is disabled
    expect(instrumented.COUNTER).toBe(doNamespace);
    expect(instrumentDurableObjectNamespace).not.toHaveBeenCalled();
  });

  it('detects and instruments DurableObjectNamespace bindings when enableRpcTracePropagation is enabled', () => {
    const doNamespace = {
      idFromName: vi.fn(),
      idFromString: vi.fn(),
      get: vi.fn(),
      newUniqueId: vi.fn(),
    };
    const env = { COUNTER: doNamespace };
    const instrumented = instrumentEnv(env, { enableRpcTracePropagation: true });

    const result = instrumented.COUNTER;
    expect(instrumentDurableObjectNamespace).toHaveBeenCalledWith(doNamespace);
    expect((result as any).__instrumented).toBe(true);
  });

  it('caches instrumented bindings across repeated access', () => {
    const doNamespace = {
      idFromName: vi.fn(),
      idFromString: vi.fn(),
      get: vi.fn(),
      newUniqueId: vi.fn(),
    };
    const env = { COUNTER: doNamespace };
    const instrumented = instrumentEnv(env, { enableRpcTracePropagation: true });

    const first = instrumented.COUNTER;
    const second = instrumented.COUNTER;

    expect(first).toBe(second);
    expect(instrumentDurableObjectNamespace).toHaveBeenCalledTimes(1);
  });

  it('instruments multiple DO bindings independently', () => {
    const doNamespace1 = {
      idFromName: vi.fn(),
      idFromString: vi.fn(),
      get: vi.fn(),
      newUniqueId: vi.fn(),
    };
    const doNamespace2 = {
      idFromName: vi.fn(),
      idFromString: vi.fn(),
      get: vi.fn(),
      newUniqueId: vi.fn(),
    };
    const env = { COUNTER: doNamespace1, SESSIONS: doNamespace2 };
    const instrumented = instrumentEnv(env, { enableRpcTracePropagation: true });

    instrumented.COUNTER;
    instrumented.SESSIONS;

    expect(instrumentDurableObjectNamespace).toHaveBeenCalledTimes(2);
    expect(instrumentDurableObjectNamespace).toHaveBeenCalledWith(doNamespace1);
    expect(instrumentDurableObjectNamespace).toHaveBeenCalledWith(doNamespace2);
  });

  it('does not wrap JSRPC proxy when enableRpcTracePropagation is disabled', () => {
    const mockFetch = vi.fn();
    const jsrpcProxy = new Proxy(
      { fetch: mockFetch },
      {
        get(target, prop) {
          if (prop in target) {
            return Reflect.get(target, prop);
          }
          // JSRPC behavior: return truthy for any property
          return () => {};
        },
      },
    );
    const env = { SERVICE: jsrpcProxy };
    const instrumented = instrumentEnv(env);

    const result = instrumented.SERVICE;
    // Should be the same reference — not wrapped when propagation is disabled
    expect(result).toBe(jsrpcProxy);
    expect(instrumentDurableObjectNamespace).not.toHaveBeenCalled();
  });

  it('wraps JSRPC proxy with a Proxy that instruments fetch when enableRpcTracePropagation is enabled', () => {
    const mockFetch = vi.fn();
    const jsrpcProxy = new Proxy(
      { fetch: mockFetch },
      {
        get(target, prop) {
          if (prop in target) {
            return Reflect.get(target, prop);
          }
          // JSRPC behavior: return truthy for any property
          return () => {};
        },
      },
    );
    const env = { SERVICE: jsrpcProxy };
    const instrumented = instrumentEnv(env, { enableRpcTracePropagation: true });

    const result = instrumented.SERVICE;
    // Should NOT be the same reference — it's wrapped in a Proxy
    expect(result).not.toBe(jsrpcProxy);
    expect(instrumentDurableObjectNamespace).not.toHaveBeenCalled();
  });

  it('does not instrument JSRPC proxies as DurableObjectNamespace', () => {
    const jsrpcProxy = new Proxy(
      {},
      {
        get(_target, _prop) {
          return () => {};
        },
      },
    );
    const env = { SERVICE: jsrpcProxy };
    const instrumented = instrumentEnv(env);

    instrumented.SERVICE;
    expect(instrumentDurableObjectNamespace).not.toHaveBeenCalled();
  });

  it('returns null and undefined values unchanged', () => {
    const env = { NULL_VAL: null, UNDEF_VAL: undefined } as Record<string, unknown>;
    const instrumented = instrumentEnv(env);

    expect(instrumented.NULL_VAL).toBeNull();
    expect(instrumented.UNDEF_VAL).toBeUndefined();
  });

  it('wraps Queue bindings in a proxy', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const sendBatch = vi.fn().mockResolvedValue(undefined);
    const queue = { send, sendBatch };
    const env = { MY_QUEUE: queue };
    const instrumented = instrumentEnv(env);

    const wrapped = instrumented.MY_QUEUE as typeof queue;
    // Wrapped binding is a Proxy, not the original reference
    expect(wrapped).not.toBe(queue);
    // Calls are forwarded to the underlying queue
    await wrapped.send('hello');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toBe('hello');
  });

  it('caches the wrapped Queue binding across repeated access', () => {
    const queue = { send: vi.fn(), sendBatch: vi.fn() };
    const env = { MY_QUEUE: queue };
    const instrumented = instrumentEnv(env);

    expect(instrumented.MY_QUEUE).toBe(instrumented.MY_QUEUE);
  });

  it('wraps Queue bindings independently from DO bindings', () => {
    const queue = { send: vi.fn(), sendBatch: vi.fn() };
    const doNamespace = {
      idFromName: vi.fn(),
      idFromString: vi.fn(),
      get: vi.fn(),
      newUniqueId: vi.fn(),
    };
    const env = { MY_QUEUE: queue, COUNTER: doNamespace };
    const instrumented = instrumentEnv(env, { enableRpcTracePropagation: true });

    // Access both — DO instrumentation only fires on property access
    expect(instrumented.MY_QUEUE).not.toBe(queue);
    instrumented.COUNTER;
    expect(instrumentDurableObjectNamespace).toHaveBeenCalledWith(doNamespace);
  });

  describe('JSRPC RPC method instrumentation', () => {
    it('does not inject Sentry RPC meta by default (enableRpcTracePropagation not set)', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });

      const rpcMethod = vi.fn().mockReturnValue('result');
      const jsrpcProxy = new Proxy(
        { fetch: vi.fn(), myRpcMethod: rpcMethod },
        {
          get(target, prop) {
            if (prop in target) {
              return Reflect.get(target, prop);
            }
            return () => {};
          },
        },
      );
      const env = { SERVICE: jsrpcProxy };
      const instrumented = instrumentEnv(env);

      (instrumented.SERVICE as any).myRpcMethod('arg1', 42);

      // Without enableRpcTracePropagation, no metadata should be injected
      expect(rpcMethod).toHaveBeenCalledWith('arg1', 42);
    });

    it('injects Sentry RPC meta when enableRpcTracePropagation is true', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });

      const rpcMethod = vi.fn().mockReturnValue('result');
      const jsrpcProxy = new Proxy(
        { fetch: vi.fn(), myRpcMethod: rpcMethod },
        {
          get(target, prop) {
            if (prop in target) {
              return Reflect.get(target, prop);
            }
            return () => {};
          },
        },
      );
      const env = { SERVICE: jsrpcProxy };
      const instrumented = instrumentEnv(env, { enableRpcTracePropagation: true });

      (instrumented.SERVICE as any).myRpcMethod('arg1', 42);

      expect(rpcMethod).toHaveBeenCalledWith('arg1', 42, {
        __sentry_rpc_meta__: {
          'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
          baggage: 'sentry-environment=production',
        },
      });
    });

    it('does not inject meta into JSRPC fetch calls', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': 'abc-def-1',
        baggage: 'sentry-baggage=value',
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
      const jsrpcProxy = new Proxy(
        { fetch: mockFetch },
        {
          get(target, prop) {
            if (prop in target) {
              return Reflect.get(target, prop);
            }
            return () => {};
          },
        },
      );
      const env = { SERVICE: jsrpcProxy };
      const instrumented = instrumentEnv(env, { enableRpcTracePropagation: true });

      (instrumented.SERVICE as any).fetch('https://example.com');

      // fetch should use HTTP header injection, not trailing arg
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs).not.toContainEqual(expect.objectContaining({ __sentry: expect.anything() }));
    });

    it('does not inject meta into JSRPC RPC calls when no active trace', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({});

      const rpcMethod = vi.fn().mockReturnValue('result');
      const jsrpcProxy = new Proxy(
        { fetch: vi.fn(), myRpcMethod: rpcMethod },
        {
          get(target, prop) {
            if (prop in target) {
              return Reflect.get(target, prop);
            }
            return () => {};
          },
        },
      );
      const env = { SERVICE: jsrpcProxy };
      const instrumented = instrumentEnv(env, { enableRpcTracePropagation: true });

      (instrumented.SERVICE as any).myRpcMethod('arg1');

      expect(rpcMethod).toHaveBeenCalledWith('arg1');
    });
  });
});
