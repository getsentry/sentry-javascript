import type { ExecutionContext } from '@cloudflare/workers-types';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { instrumentDurableObjectWithSentry } from '../src';
import { getInstrumented } from '../src/instrument';
import { resetSdk } from './testUtils';

describe('instrumentDurableObjectWithSentry', () => {
  beforeEach(() => {
    resetSdk();
  });

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

  it('Reuses the same client across multiple instances', () => {
    const mockContext = {
      waitUntil: vi.fn(),
    } as any;
    const mockEnv = {} as any; // Environment mock
    let clientFromInstance1: SentryCore.Client | undefined;
    let clientFromInstance2: SentryCore.Client | undefined;
    const options = vi.fn().mockReturnValue({
      instrumentPrototypeMethods: true,
    });
    const testClass = class {
      method() {
        return SentryCore.getClient();
      }
    };
    const instance1 = Reflect.construct(instrumentDurableObjectWithSentry(options, testClass as any), [
      mockContext,
      mockEnv,
    ]);
    clientFromInstance1 = instance1.method();

    const instance2 = Reflect.construct(instrumentDurableObjectWithSentry(options, testClass as any), [
      mockContext,
      mockEnv,
    ]);
    clientFromInstance2 = instance2.method();

    // Client is reused across instances
    expect(clientFromInstance1).toBeDefined();
    expect(clientFromInstance2).toBeDefined();
    expect(clientFromInstance1).toBe(clientFromInstance2);
  });

  it('All available durable object methods are instrumented when instrumentPrototypeMethods is enabled', () => {
    const testClass = class {
      propertyFunction = vi.fn();

      rpcMethod() {}

      fetch() {}

      alarm() {}

      webSocketMessage() {}

      webSocketClose() {}

      webSocketError() {}
    };
    const instrumented = instrumentDurableObjectWithSentry(
      vi.fn().mockReturnValue({ instrumentPrototypeMethods: true }),
      testClass as any,
    );
    const obj = Reflect.construct(instrumented, []);
    for (const method_name of [
      'propertyFunction',
      'fetch',
      'alarm',
      'webSocketMessage',
      'webSocketClose',
      'webSocketError',
      'rpcMethod',
    ]) {
      expect(getInstrumented((obj as any)[method_name]), `Method ${method_name} is instrumented`).toBeTruthy();
    }
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

  describe('instrumentPrototypeMethods option', () => {
    it('does not instrument prototype methods when option is not set', () => {
      const testClass = class {
        prototypeMethod() {
          return 'prototype-result';
        }
      };
      const options = vi.fn().mockReturnValue({});
      const instrumented = instrumentDurableObjectWithSentry(options, testClass as any);
      const obj = Reflect.construct(instrumented, []);

      expect(getInstrumented(obj.prototypeMethod)).toBeFalsy();
    });

    it('does not instrument prototype methods when option is false', () => {
      const testClass = class {
        prototypeMethod() {
          return 'prototype-result';
        }
      };
      const options = vi.fn().mockReturnValue({ instrumentPrototypeMethods: false });
      const instrumented = instrumentDurableObjectWithSentry(options, testClass as any);
      const obj = Reflect.construct(instrumented, []);

      expect(getInstrumented(obj.prototypeMethod)).toBeFalsy();
    });

    it('instruments all prototype methods when option is true', () => {
      const testClass = class {
        methodOne() {
          return 'one';
        }
        methodTwo() {
          return 'two';
        }
      };
      const options = vi.fn().mockReturnValue({ instrumentPrototypeMethods: true });
      const instrumented = instrumentDurableObjectWithSentry(options, testClass as any);
      const obj = Reflect.construct(instrumented, []);

      expect(getInstrumented(obj.methodOne)).toBeTruthy();
      expect(getInstrumented(obj.methodTwo)).toBeTruthy();
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
      const options = vi.fn().mockReturnValue({ instrumentPrototypeMethods: ['methodOne', 'methodThree'] });
      const instrumented = instrumentDurableObjectWithSentry(options, testClass as any);
      const obj = Reflect.construct(instrumented, []);

      expect(getInstrumented(obj.methodOne)).toBeTruthy();
      expect(getInstrumented(obj.methodTwo)).toBeFalsy();
      expect(getInstrumented(obj.methodThree)).toBeTruthy();
    });

    it('still instruments instance methods regardless of prototype option', () => {
      const testClass = class {
        propertyFunction = vi.fn();

        fetch() {}
        alarm() {}
        webSocketMessage() {}
        webSocketClose() {}
        webSocketError() {}
      };
      const options = vi.fn().mockReturnValue({ instrumentPrototypeMethods: false });
      const instrumented = instrumentDurableObjectWithSentry(options, testClass as any);
      const obj = Reflect.construct(instrumented, []);

      // Instance methods should still be instrumented
      expect(getInstrumented(obj.propertyFunction)).toBeTruthy();
      expect(getInstrumented(obj.fetch)).toBeTruthy();
      expect(getInstrumented(obj.alarm)).toBeTruthy();
      expect(getInstrumented(obj.webSocketMessage)).toBeTruthy();
      expect(getInstrumented(obj.webSocketClose)).toBeTruthy();
      expect(getInstrumented(obj.webSocketError)).toBeTruthy();
    });
  });
});
