import type { ExecutionContext } from '@cloudflare/workers-types';
import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { instrumentDurableObjectWithSentry } from '../src';
import { getInstrumented } from '../src/instrument';

describe('instrumentDurableObjectWithSentry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Generic functionality', () => {
    const options = vi.fn().mockReturnValue({});
    const instrumented = instrumentDurableObjectWithSentry(options, vi.fn());
    expect(instrumented).toBeTypeOf('function');
    expect(() => Reflect.construct(instrumented, [])).not.toThrow();
    expect(options).toHaveBeenCalledOnce();
  });

  it('Instruments sync prototype methods and defines implementation in the object', () => {
    const testClass = class {
      method() {
        return 'sync-result';
      }
    };
    const obj = Reflect.construct(instrumentDurableObjectWithSentry(vi.fn().mockReturnValue({}), testClass as any), []);
    expect(obj.method).toBe(obj.method);

    const result = obj.method();
    expect(result).not.toBeInstanceOf(Promise);
    expect(result).toEqual('sync-result');
  });

  it('Instruments async prototype methods and returns a promise', async () => {
    const testClass = class {
      async asyncMethod() {
        return 'async-result';
      }
    };
    const obj = Reflect.construct(instrumentDurableObjectWithSentry(vi.fn().mockReturnValue({}), testClass as any), []);
    expect(obj.asyncMethod).toBe(obj.asyncMethod);

    const result = obj.asyncMethod();
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe('async-result');
  });

  it('Instruments prototype methods without "sticking" to the options', () => {
    const mockContext = {
      waitUntil: vi.fn(),
    } as any;
    const mockEnv = {} as any; // Environment mock
    const initCore = vi.spyOn(SentryCore, 'initAndBind');
    vi.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);
    const options = vi
      .fn()
      .mockReturnValueOnce({
        orgId: 1,
        instrumentPrototypeMethods: true,
      })
      .mockReturnValueOnce({
        orgId: 2,
        instrumentPrototypeMethods: true,
      });
    const testClass = class {
      method() {}
    };
    const instance1 = Reflect.construct(instrumentDurableObjectWithSentry(options, testClass as any), [
      mockContext,
      mockEnv,
    ]);
    instance1.method();

    const instance2 = Reflect.construct(instrumentDurableObjectWithSentry(options, testClass as any), [
      mockContext,
      mockEnv,
    ]);
    instance2.method();

    expect(initCore).nthCalledWith(1, expect.any(Function), expect.objectContaining({ orgId: 1 }));
    expect(initCore).nthCalledWith(2, expect.any(Function), expect.objectContaining({ orgId: 2 }));
  });

  it('Built-in durable object methods are always instrumented', () => {
    const testClass = class {
      fetch() {}

      alarm() {}

      webSocketMessage() {}

      webSocketClose() {}

      webSocketError() {}
    };
    const instrumented = instrumentDurableObjectWithSentry(vi.fn().mockReturnValue({}), testClass as any);
    const obj = Reflect.construct(instrumented, []);

    // Built-in DO methods are always instrumented
    for (const method_name of ['fetch', 'alarm', 'webSocketMessage', 'webSocketClose', 'webSocketError']) {
      expect(getInstrumented((obj as any)[method_name]), `Method ${method_name} is instrumented`).toBeTruthy();
    }
  });

  it('Does not instrument RPC methods when instrumentPrototypeMethods is not set', () => {
    const testClass = class {
      rpcMethod() {
        return 'result';
      }
    };
    const instrumented = instrumentDurableObjectWithSentry(vi.fn().mockReturnValue({}), testClass as any);
    const obj = Reflect.construct(instrumented, []);

    // RPC method should not be wrapped
    expect(getInstrumented(obj.rpcMethod)).toBeFalsy();
    expect(obj.rpcMethod()).toBe('result');
  });

  describe('instrumentPrototypeMethods option', () => {
    it('instruments all RPC methods when option is true', () => {
      const testClass = class {
        rpcMethodOne() {
          return 'one';
        }
        rpcMethodTwo() {
          return 'two';
        }
      };
      const instrumented = instrumentDurableObjectWithSentry(
        vi.fn().mockReturnValue({ instrumentPrototypeMethods: true }),
        testClass as any,
      );
      const obj = Reflect.construct(instrumented, []);

      // RPC methods (prototype methods) are wrapped via Proxy - verify they are callable and cached
      expect(typeof obj.rpcMethodOne).toBe('function');
      expect(typeof obj.rpcMethodTwo).toBe('function');
      expect(obj.rpcMethodOne).toBe(obj.rpcMethodOne); // Cached wrapper
      expect(obj.rpcMethodTwo).toBe(obj.rpcMethodTwo); // Cached wrapper
      expect(obj.rpcMethodOne()).toBe('one');
      expect(obj.rpcMethodTwo()).toBe('two');
    });

    it('instruments only specified methods when option is array', () => {
      const testClass = class {
        methodOne() {
          return 'one';
        }
        methodTwo() {
          return 'two';
        }
        methodThree() {
          return 'three';
        }
      };
      const instrumented = instrumentDurableObjectWithSentry(
        vi.fn().mockReturnValue({ instrumentPrototypeMethods: ['methodOne', 'methodThree'] }),
        testClass as any,
      );
      const obj = Reflect.construct(instrumented, []);

      // methodOne and methodThree should be wrapped — i.e. they should NOT be
      // identical to the underlying prototype method.
      expect(obj.methodOne).not.toBe(testClass.prototype.methodOne);
      expect(obj.methodThree).not.toBe(testClass.prototype.methodThree);

      // methodTwo is not in the allow-list and must remain the original
      // prototype method (i.e. not wrapped).
      expect(obj.methodTwo).toBe(testClass.prototype.methodTwo);

      // All methods should still be callable and behave correctly.
      expect(obj.methodOne()).toBe('one');
      expect(obj.methodTwo()).toBe('two');
      expect(obj.methodThree()).toBe('three');
    });

    it('does not instrument any RPC methods when option is empty array', () => {
      const testClass = class {
        methodOne() {
          return 'one';
        }
        methodTwo() {
          return 'two';
        }
      };
      const instrumented = instrumentDurableObjectWithSentry(
        vi.fn().mockReturnValue({ instrumentPrototypeMethods: [] }),
        testClass as any,
      );
      const obj = Reflect.construct(instrumented, []);

      // Empty array means no methods are allowed → none should be wrapped.
      expect(obj.methodOne).toBe(testClass.prototype.methodOne);
      expect(obj.methodTwo).toBe(testClass.prototype.methodTwo);
      expect(obj.methodOne()).toBe('one');
      expect(obj.methodTwo()).toBe('two');
    });

    it('does not instrument RPC methods when option is false', () => {
      const testClass = class {
        rpcMethod() {
          return 'result';
        }
      };
      const instrumented = instrumentDurableObjectWithSentry(
        vi.fn().mockReturnValue({ instrumentPrototypeMethods: false }),
        testClass as any,
      );
      const obj = Reflect.construct(instrumented, []);

      // RPC method should not be wrapped
      expect(getInstrumented(obj.rpcMethod)).toBeFalsy();
      expect(obj.rpcMethod()).toBe('result');
    });

    it('does not wrap Object.prototype methods as RPC methods', () => {
      const testClass = class {
        rpcMethod() {
          return 'rpc-result';
        }
      };
      const instrumented = instrumentDurableObjectWithSentry(
        vi.fn().mockReturnValue({ enableRpcTracePropagation: true }),
        testClass as any,
      );
      const obj = Reflect.construct(instrumented, []);

      // Object.prototype methods should NOT be wrapped - they should be the original methods
      expect(obj.toString).toBe(Object.prototype.toString);
      expect(obj.valueOf).toBe(Object.prototype.valueOf);
      expect(obj.hasOwnProperty).toBe(Object.prototype.hasOwnProperty);
      expect(obj.propertyIsEnumerable).toBe(Object.prototype.propertyIsEnumerable);
      expect(obj.isPrototypeOf).toBe(Object.prototype.isPrototypeOf);
      expect(obj.toLocaleString).toBe(Object.prototype.toLocaleString);

      // They should still work correctly
      expect(obj.toString()).toBe('[object Object]');
      expect(obj.hasOwnProperty('rpcMethod')).toBe(false); // It's on prototype, not own
      expect(obj.valueOf()).toBe(obj);

      // Meanwhile, actual RPC methods SHOULD be wrapped (not equal to prototype method)
      expect(obj.rpcMethod).not.toBe(testClass.prototype.rpcMethod);
      expect(obj.rpcMethod()).toBe('rpc-result');
    });
  });

  it('flush performs after all waitUntil promises are finished', async () => {
    // Spy on Client.prototype.flush and mock it to resolve immediately to avoid timeout issues with fake timers
    const flush = vi.spyOn(SentryCore.Client.prototype, 'flush').mockResolvedValue(true);
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    // Measure delta instead of absolute call count to avoid interference from parallel tests.
    // Since we spy on the prototype, other tests running in parallel may also call flush.
    // By measuring before/after, we only verify that THIS test triggered exactly one flush call.
    const before = flush.mock.calls.length;

    const waitUntil = vi.fn();
    const testClass = vi.fn(context => ({
      fetch: () => {
        context.waitUntil(new Promise(res => setTimeout(res)));
        return new Response('test');
      },
    }));
    const instrumented = instrumentDurableObjectWithSentry(vi.fn(), testClass as any);
    const context = {
      waitUntil,
    } as unknown as ExecutionContext;
    const dObject: any = Reflect.construct(instrumented, [context, {} as any]);

    // Call fetch (don't await yet)
    const responsePromise = dObject.fetch(new Request('https://example.com'));

    // Advance past classification timeout and get response
    vi.advanceTimersByTime(30);
    const response = await responsePromise;

    // Consume response (triggers span end for buffered responses)
    await response.text();

    // The flush should now be queued in waitUntil
    expect(waitUntil).toHaveBeenCalled();

    // Advance to trigger the setTimeout in the handler's waitUntil
    vi.advanceTimersToNextTimer();
    await Promise.all(waitUntil.mock.calls.map(([p]) => p));

    const after = flush.mock.calls.length;
    const delta = after - before;

    // Verify that exactly one flush call was made during this test
    expect(delta).toBe(1);
  });
});
