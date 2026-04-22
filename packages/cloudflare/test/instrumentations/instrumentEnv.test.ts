import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentEnv } from '../../src/instrumentations/worker/instrumentEnv';

vi.mock('../../src/instrumentations/instrumentDurableObjectNamespace', () => ({
  instrumentDurableObjectNamespace: vi.fn((namespace: unknown) => ({
    __instrumented: true,
    __original: namespace,
  })),
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

  it('returns env as-is when enableRpcTracePropagation is disabled', () => {
    const doNamespace = {
      idFromName: vi.fn(),
      idFromString: vi.fn(),
      get: vi.fn(),
      newUniqueId: vi.fn(),
    };
    const env = { COUNTER: doNamespace };
    const instrumented = instrumentEnv(env);

    // When trace propagation is disabled, env is returned as-is
    expect(instrumented).toBe(env);
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
});
