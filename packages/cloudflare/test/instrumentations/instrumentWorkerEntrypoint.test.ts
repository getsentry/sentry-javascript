import type { ExecutionContext } from '@cloudflare/workers-types';
import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getInstrumented } from '../../src/instrument';
import {
  instrumentWorkerEntrypoint,
  type WorkerEntrypointConstructor,
} from '../../src/instrumentations/instrumentWorkerEntrypoint';
import { resetSdk } from '../testUtils';

function createMockExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {},
  };
}

class WorkerEntrypoint {}

describe('instrumentWorkerEntrypoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetSdk();
  });

  it('Generic functionality', () => {
    const options = vi.fn().mockReturnValue({});
    const instrumented = instrumentWorkerEntrypoint(options, vi.fn());
    expect(instrumented).toBeTypeOf('function');
    expect(() => Reflect.construct(instrumented, [])).not.toThrow();
    expect(options).toHaveBeenCalledOnce();
  });

  it('Instruments sync prototype methods and defines implementation in the object', () => {
    const TestClass = class extends WorkerEntrypoint {
      method() {
        return 'sync-result';
      }
    };
    const obj = Reflect.construct(
      instrumentWorkerEntrypoint(vi.fn().mockReturnValue({}), TestClass as unknown as WorkerEntrypointConstructor),
      [],
    );
    expect(obj.method).toBe(obj.method);

    const result = obj.method();
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toEqual('sync-result');
  });

  it('Instruments async prototype methods and returns a promise', async () => {
    const TestClass = class extends WorkerEntrypoint {
      async asyncMethod() {
        return 'async-result';
      }
    };
    const obj = Reflect.construct(
      instrumentWorkerEntrypoint(vi.fn().mockReturnValue({}), TestClass as unknown as WorkerEntrypointConstructor),
      [],
    );
    expect(obj.asyncMethod).toBe(obj.asyncMethod);

    const result = obj.asyncMethod();
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe('async-result');
  });

  it('Calls options callback per instance with env', () => {
    const mockContext = createMockExecutionContext();
    const mockEnv1: Record<string, unknown> = { SENTRY_DSN: 'dsn1' };
    const mockEnv2: Record<string, unknown> = { SENTRY_DSN: 'dsn2' };
    const options = vi.fn().mockReturnValueOnce({ dsn: 'dsn1' }).mockReturnValueOnce({ dsn: 'dsn2' });
    const TestClass = class extends WorkerEntrypoint {
      fetch() {
        return new Response('ok');
      }
    };
    const instrumented = instrumentWorkerEntrypoint(options, TestClass as unknown as WorkerEntrypointConstructor);

    Reflect.construct(instrumented, [mockContext, mockEnv1]);
    Reflect.construct(instrumented, [mockContext, mockEnv2]);

    expect(options).toHaveBeenCalledWith(mockEnv1);
    expect(options).toHaveBeenCalledWith(mockEnv2);
  });

  it('Instruments fetch, scheduled, queue, tail handler methods', async () => {
    const TestClass = class extends WorkerEntrypoint {
      fetch(_request: Request) {
        return new Response('ok');
      }
      scheduled() {}
      queue() {}
      tail() {}
    };
    const mockContext = createMockExecutionContext();
    const instrumented = instrumentWorkerEntrypoint(
      vi.fn().mockReturnValue({}),
      TestClass as unknown as WorkerEntrypointConstructor,
    );
    const obj = Reflect.construct(instrumented, [mockContext, {}]);

    expect(typeof obj.fetch).toBe('function');
    expect(typeof obj.scheduled).toBe('function');
    expect(typeof obj.queue).toBe('function');
    expect(typeof obj.tail).toBe('function');

    const response = await obj.fetch(new Request('https://example.com'));
    expect(response).toBeInstanceOf(Response);
    expect(await response.text()).toBe('ok');
  });

  it('Does not instrument ctx and env properties', () => {
    const mockContext = createMockExecutionContext();
    const mockEnv = {};
    const TestClass = class extends WorkerEntrypoint {
      ctx = {};
      env = {};
    };
    const instrumented = instrumentWorkerEntrypoint(
      vi.fn().mockReturnValue({}),
      TestClass as unknown as WorkerEntrypointConstructor,
    );
    const obj = Reflect.construct(instrumented, [mockContext, mockEnv]);

    expect(getInstrumented(obj.ctx)).toBeFalsy();
    expect(getInstrumented(obj.env)).toBeFalsy();
  });

  it('Overrides obj.ctx with instrumented context so user code using this.ctx.waitUntil works', async () => {
    const mockContext = createMockExecutionContext();
    const mockEnv = {};
    const TestClass = class extends WorkerEntrypoint {
      ctx = createMockExecutionContext();
      env = {};
      fetch() {
        this.ctx.waitUntil(Promise.resolve());
        return new Response('ok');
      }
    };
    const instrumented = instrumentWorkerEntrypoint(
      vi.fn().mockReturnValue({}),
      TestClass as unknown as WorkerEntrypointConstructor,
    );
    const obj = Reflect.construct(instrumented, [mockContext, mockEnv]);

    expect(obj.ctx).not.toBe(mockContext);
    expect(typeof obj.ctx.waitUntil).toBe('function');
    const response = await obj.fetch(new Request('https://example.com'));
    expect(response).toBeInstanceOf(Response);
    expect(mockContext.waitUntil).toHaveBeenCalled();
  });

  it('Uses instrumentContext so context passed to handlers has overridable waitUntil', () => {
    const rawCtx = createMockExecutionContext();
    const TestClass = class extends WorkerEntrypoint {
      ctx = {};
      env = {};
      fetch() {
        return new Response('ok');
      }
    };
    const instrumented = instrumentWorkerEntrypoint(
      vi.fn().mockReturnValue({}),
      TestClass as unknown as WorkerEntrypointConstructor,
    );
    const obj = Reflect.construct(instrumented, [rawCtx, {}]);

    expect(obj.ctx).toBeDefined();
    expect(obj.ctx).not.toBe(rawCtx);
    expect(obj.__SENTRY_CONTEXT__).toBeDefined();
    expect(obj.__SENTRY_CONTEXT__).not.toBe(rawCtx);
    expect(obj.__SENTRY_CONTEXT__).toBe(obj.ctx);
  });

  it('Calls setAsyncLocalStorageAsyncContextStrategy outside Proxy (at instrumentation time), not inside construct', async () => {
    const asyncModule = await import('@sentry/server-utils/no-diagnostic-channels');
    const setStrategy = vi.spyOn(asyncModule, 'setAsyncLocalStorageAsyncContextStrategy');
    const mockContext = createMockExecutionContext();
    const TestClass = class extends WorkerEntrypoint {
      fetch() {
        return new Response('ok');
      }
    };

    const instrumented = instrumentWorkerEntrypoint(
      vi.fn().mockReturnValue({}),
      TestClass as unknown as WorkerEntrypointConstructor,
    );
    expect(setStrategy).toHaveBeenCalledTimes(1);

    Reflect.construct(instrumented, [mockContext, {}]);
    Reflect.construct(instrumented, [mockContext, {}]);
    expect(setStrategy).toHaveBeenCalledTimes(1);
    setStrategy.mockRestore();
  });

  it('flush performs after all waitUntil promises are finished', async () => {
    let testClientFlushCount = 0;
    let testClient: SentryCore.Client | undefined;

    vi.spyOn(SentryCore.Client.prototype, 'flush').mockImplementation(function (this: SentryCore.Client) {
      if (this === testClient) {
        testClientFlushCount++;
      }
      return Promise.resolve(true);
    });

    let resolveWaitUntil!: () => void;
    const deferred = new Promise<void>(res => {
      resolveWaitUntil = res;
    });

    const waitUntil = vi.fn();
    const TestClass = vi.fn((context: ExecutionContext) => ({
      fetch: () => {
        // The client is created per request, on the scope forked for that request, so it is only
        // reachable from inside the handler.
        testClient = SentryCore.getClient();
        context.waitUntil(deferred);
        return new Response('test');
      },
    }));
    const instrumented = instrumentWorkerEntrypoint(vi.fn(), TestClass as unknown as WorkerEntrypointConstructor);
    const context = { ...createMockExecutionContext(), waitUntil };
    const worker = Reflect.construct(instrumented, [context, {}]);

    const responsePromise = worker.fetch(new Request('https://example.com'));

    const response = await responsePromise;
    await response.text();

    expect(waitUntil).toHaveBeenCalled();

    resolveWaitUntil();
    await Promise.all(waitUntil.mock.calls.map(([p]) => p));

    expect(testClientFlushCount).toBe(1);
  });

  describe('custom RPC methods', () => {
    it('binds non-RPC methods and getters to the original instance', () => {
      class TestClass extends WorkerEntrypoint {
        #value = 'value';

        ownMethod = function ownMethod(this: TestClass) {
          return this.#value;
        };

        get value() {
          return this.#value;
        }
      }
      const obj = Reflect.construct(
        instrumentWorkerEntrypoint(() => ({}), TestClass as unknown as WorkerEntrypointConstructor),
        [createMockExecutionContext(), {}],
      );

      expect(obj.ownMethod).toBe(obj.ownMethod);
      expect(obj.ownMethod()).toBe('value');
      expect(obj.value).toBe('value');
      expect(obj.toString()).toBe('[object Object]');
      expect(obj.ownMethod.name).toBe('ownMethod');

      const other = { value: true };
      expect(obj.hasOwnProperty.call(other, 'value')).toBe(true);
    });

    it('handles method replacement and frozen own methods', () => {
      const frozenMethod = () => 'frozen';
      class TestClass extends WorkerEntrypoint {
        method() {
          return 'first';
        }
      }
      const obj = Reflect.construct(
        instrumentWorkerEntrypoint(() => ({}), TestClass as unknown as WorkerEntrypointConstructor),
        [createMockExecutionContext(), {}],
      );
      Object.defineProperty(obj, 'frozenMethod', {
        configurable: false,
        value: frozenMethod,
        writable: false,
      });

      expect(obj.method()).toBe('first');
      TestClass.prototype.method = () => 'second';
      expect(obj.method()).toBe('second');
      expect(obj.frozenMethod).toBe(frozenMethod);
    });

    it('preserves `this` for custom RPC methods when RPC trace propagation is enabled', () => {
      class TestClass extends WorkerEntrypoint {
        #value = 'secret';

        readValue() {
          return this.#value;
        }
      }
      const obj = Reflect.construct(
        instrumentWorkerEntrypoint(
          () => ({ enableRpcTracePropagation: true }),
          TestClass as unknown as WorkerEntrypointConstructor,
        ),
        [createMockExecutionContext(), {}],
      );

      // No propagated trace metadata takes the error-capture-only path.
      expect(obj.readValue()).toBe('secret');

      // Propagated trace metadata takes the traced (span-creating) path.
      const rpcMeta = { __sentry_rpc_meta__: { 'sentry-trace': 'trace-data' } };
      expect(obj.readValue(rpcMeta)).toBe('secret');
    });

    it('strips RPC metadata even when trace propagation is disabled', () => {
      const rpcMeta = { __sentry_rpc_meta__: { 'sentry-trace': 'trace-data' } };
      const TestClass = class extends WorkerEntrypoint {
        inspect(...args: unknown[]) {
          return args;
        }
      };
      const obj = Reflect.construct(
        instrumentWorkerEntrypoint(
          () => ({ enableRpcTracePropagation: false }),
          TestClass as unknown as WorkerEntrypointConstructor,
        ),
        [createMockExecutionContext(), {}],
      );

      expect(obj.inspect).toBe(obj.inspect);
      expect(obj.inspect(rpcMeta)).toEqual([]);
    });

    it('flushes repeated calls on the same instance', async () => {
      const events: Event[] = [];
      const waits: Promise<unknown>[] = [];
      const context = createMockExecutionContext();
      context.waitUntil = vi.fn(promise => {
        waits.push(promise);
      });
      const TestClass = class extends WorkerEntrypoint {
        async get(value: string) {
          SentryCore.captureMessage(value);
          return value;
        }
      };
      const obj = Reflect.construct(
        instrumentWorkerEntrypoint(
          () => ({
            dsn: 'https://public@dsn.ingest.sentry.io/1337',
            beforeSend(event) {
              events.push(event);
              return null;
            },
          }),
          TestClass as unknown as WorkerEntrypointConstructor,
        ),
        [context, {}],
      );

      await expect(obj.get('first call')).resolves.toBe('first call');
      await Promise.all(waits.splice(0));
      await expect(obj.get('second call')).resolves.toBe('second call');
      await Promise.all(waits);

      expect(events.map(event => event.message)).toEqual(['first call', 'second call']);
    });

    it('does not create a second invocation for direct calls from RPC or lifecycle methods', async () => {
      const events: Event[] = [];
      const waits: Promise<unknown>[] = [];
      const context = createMockExecutionContext();
      context.waitUntil = vi.fn(promise => {
        waits.push(promise);
      });
      const TestClass = class extends WorkerEntrypoint {
        async outer() {
          return this.inner();
        }

        async fetch() {
          return this.inner();
        }

        async inner(): Promise<never> {
          throw new Error('inner failure');
        }
      };
      const obj = Reflect.construct(
        instrumentWorkerEntrypoint(
          () => ({
            dsn: 'https://public@dsn.ingest.sentry.io/1337',
            beforeSend(event) {
              events.push(event);
              return null;
            },
          }),
          TestClass as unknown as WorkerEntrypointConstructor,
        ),
        [context, {}],
      );

      await expect(obj.outer()).rejects.toThrow('inner failure');
      await Promise.all(waits.splice(0));
      expect(events).toHaveLength(1);

      await expect(obj.fetch(new Request('https://example.com'))).rejects.toThrow('inner failure');
      await Promise.all(waits);
      expect(events).toHaveLength(2);
    });

    it('only excludes WorkerEntrypoint lifecycle methods from RPC instrumentation', async () => {
      const initAndBind = vi.spyOn(SentryCore, 'initAndBind');
      const TestClass = class extends WorkerEntrypoint {
        alarm() {}

        fetch() {
          return new Response('ok');
        }

        tailStream() {}

        test() {}

        trace() {}

        webSocketMessage() {}
      };
      const obj = Reflect.construct(
        instrumentWorkerEntrypoint(() => ({}), TestClass as unknown as WorkerEntrypointConstructor),
        [createMockExecutionContext(), {}],
      );

      const response = await obj.fetch(new Request('https://example.com'));
      await response.text();
      obj.tailStream();
      obj.test();
      obj.trace();
      await obj.alarm();
      await obj.webSocketMessage();

      expect(initAndBind).toHaveBeenCalledTimes(3);
    });
  });

  describe('env instrumentation', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('passes instrumented env to the constructor when enableRpcTracePropagation is enabled', () => {
      const mockContext = createMockExecutionContext();
      const doNamespace = {
        idFromName: vi.fn(),
        idFromString: vi.fn(),
        get: vi.fn(),
        newUniqueId: vi.fn(),
      };
      const mockEnv = { COUNTER: doNamespace, SENTRY_DSN: 'dsn' };

      let constructorEnv: unknown;
      const TestClass = class extends WorkerEntrypoint {
        constructor(ctx: ExecutionContext, env: typeof mockEnv) {
          super();
          constructorEnv = env;
        }
        fetch() {
          return new Response('ok');
        }
      };

      const instrumented = instrumentWorkerEntrypoint(
        () => ({ enableRpcTracePropagation: true }),
        TestClass as unknown as WorkerEntrypointConstructor,
      );
      Reflect.construct(instrumented, [mockContext, mockEnv]);

      expect(constructorEnv).not.toBe(mockEnv);
    });

    it('exposes instrumented DurableObjectNamespace via this.env when enableRpcTracePropagation is enabled', async () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });

      const mockContext = createMockExecutionContext();
      const rpcMethod = vi.fn().mockReturnValue('result');
      const mockStub = {
        id: { toString: () => 'stub-id' },
        fetch: vi.fn(),
        myRpcMethod: rpcMethod,
      };
      const doNamespace = {
        idFromName: vi.fn().mockReturnValue({ toString: () => 'id-1' }),
        idFromString: vi.fn(),
        get: vi.fn().mockReturnValue(mockStub),
        newUniqueId: vi.fn(),
      };
      const mockEnv = { COUNTER: doNamespace };

      const TestClass = class extends WorkerEntrypoint {
        env = {} as typeof mockEnv;
        fetch() {
          const stub = this.env.COUNTER.get(this.env.COUNTER.idFromName('test'));
          (stub as any).myRpcMethod('arg1');
          return new Response('ok');
        }
      };

      const instrumented = instrumentWorkerEntrypoint(
        () => ({ enableRpcTracePropagation: true }),
        TestClass as unknown as WorkerEntrypointConstructor,
      );
      const obj = Reflect.construct(instrumented, [mockContext, mockEnv]);
      await obj.fetch(new Request('https://example.com'));

      expect(rpcMethod).toHaveBeenCalledWith('arg1', {
        __sentry_rpc_meta__: {
          'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
          baggage: 'sentry-environment=production',
        },
      });
    });

    it('returns original DurableObjectNamespace via this.env when enableRpcTracePropagation is disabled', async () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });

      const mockContext = createMockExecutionContext();
      const rpcMethod = vi.fn().mockReturnValue('result');
      const mockStub = {
        id: { toString: () => 'stub-id' },
        fetch: vi.fn(),
        myRpcMethod: rpcMethod,
      };
      const doNamespace = {
        idFromName: vi.fn().mockReturnValue({ toString: () => 'id-1' }),
        idFromString: vi.fn(),
        get: vi.fn().mockReturnValue(mockStub),
        newUniqueId: vi.fn(),
      };
      const mockEnv = { COUNTER: doNamespace };

      const TestClass = class extends WorkerEntrypoint {
        env = {} as typeof mockEnv;
        fetch() {
          const stub = this.env.COUNTER.get(this.env.COUNTER.idFromName('test'));
          (stub as any).myRpcMethod('arg1');
          return new Response('ok');
        }
      };

      const instrumented = instrumentWorkerEntrypoint(
        () => ({ enableRpcTracePropagation: false }),
        TestClass as unknown as WorkerEntrypointConstructor,
      );
      const obj = Reflect.construct(instrumented, [mockContext, mockEnv]);
      await obj.fetch(new Request('https://example.com'));

      expect(rpcMethod).toHaveBeenCalledWith('arg1');
    });

    it('injects Sentry RPC meta into JSRPC calls via this.env when enableRpcTracePropagation is enabled', async () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });

      const mockContext = createMockExecutionContext();
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
      const mockEnv = { SERVICE: jsrpcProxy };

      const TestClass = class extends WorkerEntrypoint {
        env = {} as typeof mockEnv;
        fetch() {
          (this.env.SERVICE as any).myRpcMethod('arg1', 42);
          return new Response('ok');
        }
      };

      const instrumented = instrumentWorkerEntrypoint(
        () => ({ enableRpcTracePropagation: true }),
        TestClass as unknown as WorkerEntrypointConstructor,
      );
      const obj = Reflect.construct(instrumented, [mockContext, mockEnv]);
      await obj.fetch(new Request('https://example.com'));

      expect(rpcMethod).toHaveBeenCalledWith('arg1', 42, {
        __sentry_rpc_meta__: {
          'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
          baggage: 'sentry-environment=production',
        },
      });
    });

    it('does not inject Sentry RPC meta into JSRPC calls via this.env when enableRpcTracePropagation is disabled', async () => {
      vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=production',
      });

      const mockContext = createMockExecutionContext();
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
      const mockEnv = { SERVICE: jsrpcProxy };

      const TestClass = class extends WorkerEntrypoint {
        env = {} as typeof mockEnv;
        fetch() {
          (this.env.SERVICE as any).myRpcMethod('arg1', 42);
          return new Response('ok');
        }
      };

      const instrumented = instrumentWorkerEntrypoint(
        () => ({ enableRpcTracePropagation: false }),
        TestClass as unknown as WorkerEntrypointConstructor,
      );
      const obj = Reflect.construct(instrumented, [mockContext, mockEnv]);
      await obj.fetch(new Request('https://example.com'));

      expect(rpcMethod).toHaveBeenCalledWith('arg1', 42);
    });

    it('caches instrumented bindings across multiple accesses via this.env', async () => {
      const mockContext = createMockExecutionContext();
      const doNamespace = {
        idFromName: vi.fn(),
        idFromString: vi.fn(),
        get: vi.fn(),
        newUniqueId: vi.fn(),
      };
      const mockEnv = { COUNTER: doNamespace };

      let firstAccess: unknown;
      let secondAccess: unknown;
      const TestClass = class extends WorkerEntrypoint {
        env = {} as typeof mockEnv;
        fetch() {
          firstAccess = this.env.COUNTER;
          secondAccess = this.env.COUNTER;
          return new Response('ok');
        }
      };

      const instrumented = instrumentWorkerEntrypoint(
        () => ({ enableRpcTracePropagation: true }),
        TestClass as unknown as WorkerEntrypointConstructor,
      );
      const obj = Reflect.construct(instrumented, [mockContext, mockEnv]);
      await obj.fetch(new Request('https://example.com'));

      expect(firstAccess).toBe(secondAccess);
    });

    it('primitive env values are returned unchanged', async () => {
      const mockContext = createMockExecutionContext();
      const mockEnv = { SENTRY_DSN: 'https://key@sentry.io/123', PORT: 8080, DEBUG: true };

      let capturedDsn: unknown;
      let capturedPort: unknown;
      let capturedDebug: unknown;
      const TestClass = class extends WorkerEntrypoint {
        env = {} as typeof mockEnv;
        fetch() {
          capturedDsn = this.env.SENTRY_DSN;
          capturedPort = this.env.PORT;
          capturedDebug = this.env.DEBUG;
          return new Response('ok');
        }
      };

      const instrumented = instrumentWorkerEntrypoint(
        () => ({ enableRpcTracePropagation: true }),
        TestClass as unknown as WorkerEntrypointConstructor,
      );
      const obj = Reflect.construct(instrumented, [mockContext, mockEnv]);
      await obj.fetch(new Request('https://example.com'));

      expect(capturedDsn).toBe('https://key@sentry.io/123');
      expect(capturedPort).toBe(8080);
      expect(capturedDebug).toBe(true);
    });
  });
});
