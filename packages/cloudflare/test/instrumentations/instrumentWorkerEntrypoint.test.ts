import type { ExecutionContext } from '@cloudflare/workers-types';
import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { isInstrumented } from '../../src/instrument';
import {
  instrumentWorkerEntrypoint,
  type WorkerEntrypointConstructor,
} from '../../src/instrumentations/instrumentWorkerEntrypoint';

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

    expect(isInstrumented(obj.ctx)).toBeFalsy();
    expect(isInstrumented(obj.env)).toBeFalsy();
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
    const asyncModule = await import('../../src/async');
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
        context.waitUntil(deferred);
        return new Response('test');
      },
    }));
    const instrumented = instrumentWorkerEntrypoint(vi.fn(), TestClass as unknown as WorkerEntrypointConstructor);
    const context = { ...createMockExecutionContext(), waitUntil };
    const worker = Reflect.construct(instrumented, [context, {}]);

    const responsePromise = worker.fetch(new Request('https://example.com'));
    testClient = SentryCore.getClient();

    const response = await responsePromise;
    await response.text();

    expect(waitUntil).toHaveBeenCalled();

    resolveWaitUntil();
    await Promise.all(waitUntil.mock.calls.map(([p]) => p));

    expect(testClientFlushCount).toBe(1);
  });

  describe('instrumentPrototypeMethods option', () => {
    it('does not instrument prototype methods when option is not set', () => {
      const TestClass = class Hello extends WorkerEntrypoint {
        prototypeMethod() {
          return 'prototype-result';
        }
      };
      const options = vi.fn().mockReturnValue({});
      const instrumented = instrumentWorkerEntrypoint(options, TestClass as unknown as WorkerEntrypointConstructor);
      const obj = Reflect.construct(instrumented, []);

      expect(isInstrumented(obj.prototypeMethod)).toBeFalsy();
    });

    it('does not instrument prototype methods when option is false', () => {
      const TestClass = class extends WorkerEntrypoint {
        prototypeMethod() {
          return 'prototype-result';
        }
      };
      const options = vi.fn().mockReturnValue({ instrumentPrototypeMethods: false });
      const instrumented = instrumentWorkerEntrypoint(options, TestClass as unknown as WorkerEntrypointConstructor);
      const obj = Reflect.construct(instrumented, []);

      expect(isInstrumented(obj.prototypeMethod)).toBeFalsy();
    });

    it('does not instrument prototype methods when option is true (instrumentWorkerEntrypoint does not support instrumentPrototypeMethods)', () => {
      const TestClass = class extends WorkerEntrypoint {
        methodOne() {
          return 'one';
        }
        methodTwo() {
          return 'two';
        }
      };
      const options = vi.fn().mockReturnValue({ instrumentPrototypeMethods: true });
      const instrumented = instrumentWorkerEntrypoint(options, TestClass as unknown as WorkerEntrypointConstructor);
      const obj = Reflect.construct(instrumented, [createMockExecutionContext(), {}]);

      expect(isInstrumented(obj.methodOne)).toBeFalsy();
      expect(isInstrumented(obj.methodTwo)).toBeFalsy();
      expect(obj.methodOne()).toBe('one');
      expect(obj.methodTwo()).toBe('two');
    });
  });
});
