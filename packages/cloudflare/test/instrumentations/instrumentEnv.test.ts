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

  it('detects and instruments D1Database bindings', async () => {
    const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
    const mockStatement = {
      bind: vi.fn(),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({ success: true, meta: { duration: 0, rows_read: 0, rows_written: 0 } }),
      all: vi.fn().mockResolvedValue({ success: true, meta: { duration: 0, rows_read: 0, rows_written: 0 } }),
      raw: vi.fn().mockResolvedValue([]),
    };
    const d1Database = {
      prepare: vi.fn().mockReturnValue(mockStatement),
      batch: vi.fn().mockResolvedValue([]),
      exec: vi.fn().mockResolvedValue({ count: 0, duration: 0 }),
      dump: vi.fn(),
    };
    const env = { DB: d1Database };
    const instrumented = instrumentEnv(env);

    const db = instrumented.DB as typeof d1Database;
    await db.prepare('SELECT 1').first();

    expect(startSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'db.query', name: 'SELECT 1' }),
      expect.any(Function),
    );
  });

  it('caches instrumented D1 bindings across repeated access', () => {
    const d1Database = {
      prepare: vi.fn(),
      batch: vi.fn(),
      exec: vi.fn(),
      dump: vi.fn(),
    };
    const env = { DB: d1Database };
    const instrumented = instrumentEnv(env);

    expect(instrumented.DB).toBe(instrumented.DB);
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

  it('does not instrument DurableObjectNamespace when rpcTracePropagationTargets is empty', () => {
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

  it('instruments only the DurableObjectNamespace bindings named in the allowlist', () => {
    const allowed = { idFromName: vi.fn(), idFromString: vi.fn(), get: vi.fn(), newUniqueId: vi.fn() };
    const denied = { idFromName: vi.fn(), idFromString: vi.fn(), get: vi.fn(), newUniqueId: vi.fn() };
    const env = { COUNTER: allowed, SESSIONS: denied };
    const instrumented = instrumentEnv(env, { rpcTracePropagationTargets: ['COUNTER'] });

    expect((instrumented.COUNTER as any).__instrumented).toBe(true);
    expect(instrumented.SESSIONS).toBe(denied);
    expect(instrumentDurableObjectNamespace).toHaveBeenCalledTimes(1);
    expect(instrumentDurableObjectNamespace).toHaveBeenCalledWith(allowed);
  });

  it('matches allowlisted binding names exactly rather than as substrings', () => {
    const doNamespace = { idFromName: vi.fn(), idFromString: vi.fn(), get: vi.fn(), newUniqueId: vi.fn() };
    const env = { MY_COUNTER: doNamespace };
    const instrumented = instrumentEnv(env, { rpcTracePropagationTargets: ['COUNTER'] });

    expect(instrumented.MY_COUNTER).toBe(doNamespace);
  });

  it('supports regular expressions in the allowlist', () => {
    const doNamespace = { idFromName: vi.fn(), idFromString: vi.fn(), get: vi.fn(), newUniqueId: vi.fn() };
    const env = { SVC_ORDERS: doNamespace };
    const instrumented = instrumentEnv(env, { rpcTracePropagationTargets: [/^SVC_/] });

    expect((instrumented.SVC_ORDERS as any).__instrumented).toBe(true);
  });

  it('detects and instruments DurableObjectNamespace bindings when rpcTracePropagationTargets matches', () => {
    const doNamespace = {
      idFromName: vi.fn(),
      idFromString: vi.fn(),
      get: vi.fn(),
      newUniqueId: vi.fn(),
    };
    const env = { COUNTER: doNamespace };
    const instrumented = instrumentEnv(env, { rpcTracePropagationTargets: [/.*/] });

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
    const instrumented = instrumentEnv(env, { rpcTracePropagationTargets: [/.*/] });

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
    const instrumented = instrumentEnv(env, { rpcTracePropagationTargets: [/.*/] });

    instrumented.COUNTER;
    instrumented.SESSIONS;

    expect(instrumentDurableObjectNamespace).toHaveBeenCalledTimes(2);
    expect(instrumentDurableObjectNamespace).toHaveBeenCalledWith(doNamespace1);
    expect(instrumentDurableObjectNamespace).toHaveBeenCalledWith(doNamespace2);
  });

  it('does not wrap JSRPC proxy when rpcTracePropagationTargets is empty', () => {
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

  it('wraps JSRPC proxy with a Proxy that instruments fetch when rpcTracePropagationTargets matches', () => {
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
    const instrumented = instrumentEnv(env, { rpcTracePropagationTargets: [/.*/] });

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
    const instrumented = instrumentEnv(env, { rpcTracePropagationTargets: [/.*/] });

    // Access both — DO instrumentation only fires on property access
    expect(instrumented.MY_QUEUE).not.toBe(queue);
    instrumented.COUNTER;
    expect(instrumentDurableObjectNamespace).toHaveBeenCalledWith(doNamespace);
  });

  it('wraps RateLimit bindings in a proxy and forwards calls', async () => {
    const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
    const limit = vi.fn().mockResolvedValue({ success: true });
    const rateLimiter = { limit };
    const env = { MY_RATE_LIMITER: rateLimiter };
    const instrumented = instrumentEnv(env);

    const wrapped = instrumented.MY_RATE_LIMITER as typeof rateLimiter;
    // Wrapped binding is a Proxy, not the original reference
    expect(wrapped).not.toBe(rateLimiter);

    const outcome = await wrapped.limit({ key: 'user-123' });
    expect(outcome).toEqual({ success: true });
    expect(limit).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'rate_limit MY_RATE_LIMITER' }),
      expect.any(Function),
    );
  });

  it('caches the wrapped RateLimit binding across repeated access', () => {
    const rateLimiter = { limit: vi.fn() };
    const env = { MY_RATE_LIMITER: rateLimiter };
    const instrumented = instrumentEnv(env);

    expect(instrumented.MY_RATE_LIMITER).toBe(instrumented.MY_RATE_LIMITER);
  });

  describe('Workers AI bindings', () => {
    function createMockAiBinding() {
      return {
        run: vi.fn().mockResolvedValue({ response: 'Paris', usage: { prompt_tokens: 1, completion_tokens: 2 } }),
        gateway: vi.fn(),
        toMarkdown: vi.fn(),
        models: vi.fn(),
        autorag: vi.fn(),
      };
    }

    it('detects and wraps AI bindings, forwarding run calls unchanged', async () => {
      const ai = createMockAiBinding();
      const env = { AI: ai };
      const instrumented = instrumentEnv(env);

      const wrapped = instrumented.AI as typeof ai;
      expect(wrapped).not.toBe(ai);

      const result = await wrapped.run('@cf/meta/llama-3.1-8b-instruct', { prompt: 'Hello' });

      expect(ai.run).toHaveBeenCalledTimes(1);
      expect(ai.run).toHaveBeenCalledWith('@cf/meta/llama-3.1-8b-instruct', { prompt: 'Hello' });
      expect(result).toEqual({ response: 'Paris', usage: { prompt_tokens: 1, completion_tokens: 2 } });
    });

    it('caches the wrapped AI binding across repeated access', () => {
      const ai = createMockAiBinding();
      const env = { AI: ai };
      const instrumented = instrumentEnv(env);

      expect(instrumented.AI).toBe(instrumented.AI);
    });

    it('does not treat bindings with only a run method as AI bindings', () => {
      const notAi = { run: vi.fn() };
      const env = { RUNNER: notAi };
      const instrumented = instrumentEnv(env);

      expect(instrumented.RUNNER).toBe(notAi);
    });
  });

  describe('mTLS Fetcher bindings', () => {
    function createMtlsFetcherProxy(mockFetch: ReturnType<typeof vi.fn>) {
      return new Proxy(
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
    }

    it('does not instrument mTLS Fetcher when rpcTracePropagationTargets is empty', () => {
      const mockFetch = vi.fn();
      const mtlsFetcher = createMtlsFetcherProxy(mockFetch);
      const env = { MY_CERT: mtlsFetcher };
      const instrumented = instrumentEnv(env);

      expect(instrumented.MY_CERT).toBe(mtlsFetcher);
    });

    it('preserves existing headers and response on mTLS Fetcher fetch', async () => {
      vi.spyOn(SentryCore, '_INTERNAL_getTracingHeadersForFetchRequest').mockReturnValue({
        Authorization: 'Bearer client-cert-token',
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });

      const mockFetch = vi.fn().mockResolvedValue(new Response('mtls-response'));
      const mtlsFetcher = createMtlsFetcherProxy(mockFetch);
      const env = { MY_CERT: mtlsFetcher };
      const instrumented = instrumentEnv(env, { rpcTracePropagationTargets: [/.*/] });

      const response = await instrumented.MY_CERT.fetch('https://example.com/api', {
        headers: { Authorization: 'Bearer client-cert-token' },
      });

      const [, init] = mockFetch.mock.calls[0]!;
      const headers = new Headers(init?.headers);

      expect(instrumented.MY_CERT).not.toBe(mtlsFetcher);
      expect(headers.get('Authorization')).toBe('Bearer client-cert-token');
      expect(headers.get('sentry-trace')).toBe('12345678901234567890123456789012-1234567890123456-1');
      expect(await response.text()).toBe('mtls-response');
    });
  });

  describe('JSRPC RPC method instrumentation', () => {
    it('does not inject Sentry RPC meta by default (rpcTracePropagationTargets not set)', () => {
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

      instrumented.SERVICE.myRpcMethod('arg1', 42);

      // Without rpcTracePropagationTargets, no metadata should be injected
      expect(rpcMethod).toHaveBeenCalledWith('arg1', 42);
    });

    it('injects Sentry RPC meta when rpcTracePropagationTargets matches', () => {
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
      const instrumented = instrumentEnv(env, { rpcTracePropagationTargets: [/.*/] });

      instrumented.SERVICE.myRpcMethod('arg1', 42);

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
      const instrumented = instrumentEnv(env, { rpcTracePropagationTargets: [/.*/] });

      instrumented.SERVICE.fetch('https://example.com');

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
      const instrumented = instrumentEnv(env, { rpcTracePropagationTargets: [/.*/] });

      instrumented.SERVICE.myRpcMethod('arg1');

      expect(rpcMethod).toHaveBeenCalledWith('arg1');
    });

    // A receiver without Sentry never strips the trailing metadata argument, so a caller has to be
    // able to limit propagation to the bindings it knows are instrumented.
    // See https://github.com/getsentry/sentry-javascript/issues/23233.
    it('injects meta only into JSRPC calls on allowlisted bindings', () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });

      const allowedMethod = vi.fn();
      const deniedMethod = vi.fn();
      const createJsrpcBinding = (rpcMethod: ReturnType<typeof vi.fn>) =>
        new Proxy(
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

      const env = { ORDERS: createJsrpcBinding(allowedMethod), EXTERNAL: createJsrpcBinding(deniedMethod) };
      const instrumented = instrumentEnv(env, { rpcTracePropagationTargets: ['ORDERS'] });

      instrumented.ORDERS.myRpcMethod('first');
      instrumented.EXTERNAL.myRpcMethod('first');

      expect(allowedMethod).toHaveBeenCalledWith('first', {
        __sentry_rpc_meta__: {
          'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
          baggage: 'sentry-environment=production',
        },
      });
      expect(deniedMethod).toHaveBeenCalledWith('first');
    });
  });
});
