import type { ExecutionContext } from '@cloudflare/workers-types';
import type { Event } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { instrumentAgentWithSentry, instrumentDurableObjectWithSentry } from '../src';
import { getInstrumented } from '../src/instrument';
import { resetSdk } from './testUtils';

describe('instrumentDurableObjectWithSentry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetSdk();
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
        enableRpcTracePropagation: true,
      })
      .mockReturnValueOnce({
        orgId: 2,
        enableRpcTracePropagation: true,
      });
    const testClass = class {
      method() {}
    };
    // RPC spans are only created when Sentry RPC metadata is present on the call
    const rpcMeta = { __sentry_rpc_meta__: { 'sentry-trace': 'trace-data' } };
    const instance1 = Reflect.construct(instrumentDurableObjectWithSentry(options, testClass as any), [
      mockContext,
      mockEnv,
    ]);
    instance1.method(rpcMeta);

    const instance2 = Reflect.construct(instrumentDurableObjectWithSentry(options, testClass as any), [
      mockContext,
      mockEnv,
    ]);
    instance2.method(rpcMeta);

    expect(initCore).nthCalledWith(1, expect.any(Function), expect.objectContaining({ orgId: 1 }));
    expect(initCore).nthCalledWith(2, expect.any(Function), expect.objectContaining({ orgId: 2 }));
  });

  // Regression for #22328
  // built-in handlers live on the class prototype.
  // ensureInstrumented keys its global cache on the original function
  // reference, so without per-instance binding a second instance in the
  // same isolate reuses the first instance's wrapper.
  it('Built-in handlers do not stick to the first instance options across a shared isolate', async () => {
    const mockContext = {
      waitUntil: vi.fn(),
    } as any;
    const mockEnv = {} as any;
    const initCore = vi.spyOn(SentryCore, 'initAndBind');
    vi.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);
    const options = vi.fn().mockReturnValueOnce({ orgId: 1 }).mockReturnValueOnce({ orgId: 2 });

    const testClass = class {
      webSocketMessage() {}
    };
    const Instrumented = instrumentDurableObjectWithSentry(options, testClass as any);

    const instance1 = Reflect.construct(Instrumented, [mockContext, mockEnv]);
    const instance2 = Reflect.construct(Instrumented, [mockContext, mockEnv]);

    // Each instance must get its own wrapper, not the first instance's cached proxy.
    expect(instance2.webSocketMessage).not.toBe(instance1.webSocketMessage);

    await instance1.webSocketMessage();
    await instance2.webSocketMessage();

    expect(initCore).nthCalledWith(1, expect.any(Function), expect.objectContaining({ orgId: 1 }));
    expect(initCore).nthCalledWith(2, expect.any(Function), expect.objectContaining({ orgId: 2 }));
  });

  it('does not create RPC spans without metadata when enableRpcTracePropagation is true', () => {
    const startSpanSpy = vi.spyOn(SentryCore, 'startSpan');
    vi.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);

    const testClass = class {
      rpcMethod() {
        return 'result';
      }
    };
    const instrumented = instrumentDurableObjectWithSentry(
      vi.fn().mockReturnValue({
        enableRpcTracePropagation: true,
      }),
      testClass as any,
    );
    const obj = Reflect.construct(instrumented, []);

    expect(obj.rpcMethod()).toBe('result');
    expect(startSpanSpy).not.toHaveBeenCalled();
  });

  it('Invokes prototype methods with the instance as receiver when enableRpcTracePropagation is true', () => {
    const testClass = class {
      method() {
        return this;
      }
    };
    const instrumented = instrumentDurableObjectWithSentry(
      vi.fn().mockReturnValue({ enableRpcTracePropagation: true }),
      testClass as any,
    );
    const obj = Reflect.construct(instrumented, []);

    // The instance is not proxied, so the receiver is the instance itself — this is what keeps
    // native private fields working (#23040)
    const result = obj.method();
    expect(result).toBe(obj);
    expect(typeof result.method).toBe('function');

    // Methods should be cached (same reference on repeated access)
    expect(obj.method).toBe(obj.method);
  });

  // Hibernation-woken WebSocket messages and alarms arrive as their own invocations with no
  // enclosing instrumented handler, so each must open a fresh isolation scope. The Durable Object
  // instance outlives them, so a leak here would follow the isolate for its remaining lifetime.
  it('Runtime-invoked built-in handlers each get their own isolation scope', async () => {
    const events: Event[] = [];
    const waits: Promise<unknown>[] = [];
    const mockContext = {
      waitUntil: vi.fn((promise: Promise<unknown>) => {
        waits.push(promise);
      }),
    } as any;

    const testClass = class {
      webSocketMessage(_ws: unknown, message: string) {
        if (message === 'seed') {
          SentryCore.setTag('seeded_tag', 'from-seeding-message');
          SentryCore.setUser({ id: 'user-from-seeding-message' });
        }

        SentryCore.captureMessage(message);
      }

      alarm() {
        SentryCore.captureMessage('alarm');
      }
    };
    const obj = Reflect.construct(
      instrumentDurableObjectWithSentry(
        () => ({
          dsn: 'https://public@dsn.ingest.sentry.io/1337',
          beforeSend(event: Event) {
            events.push(event);
            return null;
          },
        }),
        testClass as any,
      ),
      [mockContext, {} as any],
    );

    await obj.webSocketMessage({}, 'seed');
    await Promise.all(waits.splice(0));
    await obj.webSocketMessage({}, 'probe');
    await Promise.all(waits.splice(0));
    await obj.alarm();
    await Promise.all(waits);

    // Guards the assertions below against passing vacuously.
    expect(events[0]?.tags).toEqual(expect.objectContaining({ seeded_tag: 'from-seeding-message' }));
    expect(events[0]?.user).toEqual({ id: 'user-from-seeding-message' });

    expect(events[1]?.message).toBe('probe');
    expect(events[1]?.tags?.seeded_tag).toBeUndefined();
    expect(events[1]?.user).toBeUndefined();

    expect(events[2]?.message).toBe('alarm');
    expect(events[2]?.tags?.seeded_tag).toBeUndefined();
    expect(events[2]?.user).toBeUndefined();
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

  it('Built-in durable object methods are own properties and not wrapped as RPC', () => {
    const testClass = class {
      fetch() {
        return new Response('fetch');
      }

      alarm() {}

      rpcMethod() {
        return 'rpc';
      }
    };
    const instrumented = instrumentDurableObjectWithSentry(
      vi.fn().mockReturnValue({ enableRpcTracePropagation: true }),
      testClass as any,
    );
    const obj = Reflect.construct(instrumented, []);

    // Built-in DO methods are set as own properties (not on prototype)
    // This ensures they are not wrapped as RPC methods by the Proxy
    expect(Object.prototype.hasOwnProperty.call(obj, 'fetch')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(obj, 'alarm')).toBe(true);

    // RPC methods remain on the prototype
    expect(Object.prototype.hasOwnProperty.call(obj, 'rpcMethod')).toBe(false);

    // All methods should still work correctly
    expect(obj.rpcMethod()).toBe('rpc');
  });

  it('preserves constructor identity', () => {
    const testClass = class MyDO {
      rpcMethod() {
        return 'result';
      }
    };
    const instrumented = instrumentDurableObjectWithSentry(
      vi.fn().mockReturnValue({ enableRpcTracePropagation: true }),
      testClass as any,
    );
    const obj = Reflect.construct(instrumented, []);

    // constructor must remain the original class reference for identity/type checks
    expect(obj.constructor).toBe(testClass);
  });

  it('honors newTarget so that subclasses of the instrumented class keep their prototype', () => {
    const testClass = class {
      fetch() {
        return new Response('fetch');
      }

      alarm() {}
    };
    const instrumented = instrumentDurableObjectWithSentry(vi.fn().mockReturnValue({}), testClass as any);

    // Dev tooling such as wrangler or `@cloudflare/vitest-pool-workers` subclasses the exported
    // (instrumented) class, so the construct trap is invoked with the subclass as `newTarget`.
    class Subclass extends instrumented {
      subclassMethod() {
        return 'subclass-result';
      }
    }

    const obj = Reflect.construct(Subclass, []);

    // The subclass prototype must be preserved
    expect(obj).toBeInstanceOf(Subclass);
    expect(obj.subclassMethod()).toBe('subclass-result');

    // Built-in DO methods are still instrumented
    expect(getInstrumented(obj.fetch)).toBeTruthy();
    expect(getInstrumented(obj.alarm)).toBeTruthy();
  });

  it('Does not instrument RPC methods when enableRpcTracePropagation is false', () => {
    const testClass = class {
      rpcMethod() {
        return 'result';
      }
    };
    const instrumented = instrumentDurableObjectWithSentry(
      vi.fn().mockReturnValue({ enableRpcTracePropagation: false }),
      testClass as any,
    );
    const obj = Reflect.construct(instrumented, []);

    // RPC method should not be wrapped
    expect(getInstrumented(obj.rpcMethod)).toBeFalsy();
    expect(obj.rpcMethod()).toBe('result');
  });

  it('instruments RPC methods by default when enableRpcTracePropagation is not set', () => {
    const testClass = class {
      rpcMethod() {
        return 'result';
      }
    };
    const instrumented = instrumentDurableObjectWithSentry(vi.fn().mockReturnValue({}), testClass as any);
    const obj = Reflect.construct(instrumented, []);

    // RPC method should be wrapped on the prototype by default
    expect(getInstrumented(obj.rpcMethod)).toBeTruthy();
    expect(obj.rpcMethod()).toBe('result');
  });

  it('does not wrap Object.prototype methods as RPC methods', () => {
    const testClass = class {
      rpcMethod() {
        return 'rpc-result';
      }
    };
    // Capture the original before construction wraps the prototype
    const originalRpcMethod = testClass.prototype.rpcMethod;

    const instrumented = instrumentDurableObjectWithSentry(
      vi.fn().mockReturnValue({ enableRpcTracePropagation: true }),
      testClass as any,
    );
    const obj = Reflect.construct(instrumented, []);

    // Object.prototype methods should NOT be wrapped with Sentry tracing.
    expect(obj.toString()).toBe('[object Object]');
    expect(obj.hasOwnProperty('rpcMethod')).toBe(false); // It's on prototype, not own
    // The instance is not proxied, so valueOf returns the instance itself
    expect(obj.valueOf()).toBe(obj);

    // Meanwhile, actual RPC methods SHOULD be wrapped on the prototype
    expect(obj.rpcMethod).not.toBe(originalRpcMethod);
    expect(obj.rpcMethod()).toBe('rpc-result');
  });

  // Frameworks that dispatch methods themselves (the `agents` `@callable()` registry, for example)
  // install their own function during construction and resolve the dispatch through that exact
  // function instance. Replacing it makes the framework no longer recognize the method, so those
  // methods must keep the function the framework installed.
  describe('framework-managed methods', () => {
    it('does not wrap methods a framework replaced during construction, but wraps the rest', () => {
      const frameworkDispatch = new WeakSet<object>();

      class FrameworkLike {
        constructor() {
          const original = FrameworkLike.prototype.greet;

          if (!frameworkDispatch.has(original)) {
            const dispatched = function (this: FrameworkLike, name: string): string {
              return original.call(this, name);
            };
            frameworkDispatch.add(dispatched);
            FrameworkLike.prototype.greet = dispatched;
          }
        }

        greet(name: string): string {
          return `Hello, ${name}!`;
        }

        fetchData(): string {
          return 'data';
        }
      }

      const originalFetchData = FrameworkLike.prototype.fetchData;

      const instrumented = instrumentDurableObjectWithSentry(
        vi.fn().mockReturnValue({ enableRpcTracePropagation: true }),
        FrameworkLike as any,
      );
      const obj = Reflect.construct(instrumented, []) as FrameworkLike;

      // Left as the framework installed it, so its identity-keyed dispatch keeps resolving
      expect(frameworkDispatch.has(FrameworkLike.prototype.greet)).toBe(true);
      expect(obj.greet('World')).toBe('Hello, World!');

      // Every other RPC method is still wrapped on the prototype
      expect(FrameworkLike.prototype.fetchData).not.toBe(originalFetchData);
      expect(obj.fetchData()).toBe('data');
    });

    it('keeps excluding a framework-managed method for instances constructed later', () => {
      const frameworkDispatch = new WeakSet<object>();

      class FrameworkLike {
        constructor() {
          const original = FrameworkLike.prototype.greet;

          // Frameworks typically install their dispatch once, for the first instance
          if (!frameworkDispatch.has(original)) {
            const dispatched = function (this: FrameworkLike, name: string): string {
              return original.call(this, name);
            };
            frameworkDispatch.add(dispatched);
            FrameworkLike.prototype.greet = dispatched;
          }
        }

        greet(name: string): string {
          return `Hello, ${name}!`;
        }
      }

      const instrumented = instrumentDurableObjectWithSentry(
        vi.fn().mockReturnValue({ enableRpcTracePropagation: true }),
        FrameworkLike as any,
      );

      Reflect.construct(instrumented, []);
      const second = Reflect.construct(instrumented, []) as FrameworkLike;

      expect(frameworkDispatch.has(FrameworkLike.prototype.greet)).toBe(true);
      expect(second.greet('World')).toBe('Hello, World!');
    });
  });

  // The wrapper replaces a method on a class the user owns, so it has to keep the parts of the
  // function that are observable from the outside.
  it('preserves the name and arity of the methods it wraps', () => {
    const testClass = class {
      rpcMethod(_a: string, _b: number): string {
        return 'rpc-result';
      }
    };

    const instrumented = instrumentDurableObjectWithSentry(
      vi.fn().mockReturnValue({ enableRpcTracePropagation: true }),
      testClass as any,
    );
    Reflect.construct(instrumented, []);

    expect(testClass.prototype.rpcMethod.name).toBe('rpcMethod');
    expect(testClass.prototype.rpcMethod.length).toBe(2);
  });

  // The runtime rejects these before any property lookup (`isReservedName` in workerd's
  // `worker-rpc.c++`), so wrapping them would mutate the user's class for no tracing.
  it('leaves methods the runtime never dispatches over RPC untouched', () => {
    const testClass = class {
      connect(): string {
        return 'connect';
      }
      dup(): string {
        return 'dup';
      }
      webSocketClose(): string {
        return 'closed';
      }
      rpcMethod(): string {
        return 'rpc-result';
      }
    };

    const originals = {
      connect: testClass.prototype.connect,
      dup: testClass.prototype.dup,
      webSocketClose: testClass.prototype.webSocketClose,
      rpcMethod: testClass.prototype.rpcMethod,
    };

    const instrumented = instrumentDurableObjectWithSentry(
      vi.fn().mockReturnValue({ enableRpcTracePropagation: true }),
      testClass as any,
    );
    Reflect.construct(instrumented, []);

    expect(testClass.prototype.connect).toBe(originals.connect);
    expect(testClass.prototype.dup).toBe(originals.dup);
    expect(testClass.prototype.webSocketClose).toBe(originals.webSocketClose);

    // A regular RPC method is still wrapped
    expect(testClass.prototype.rpcMethod).not.toBe(originals.rpcMethod);
  });

  // Regression for #23040 — workerd's native RPC dispatch (Durable Object facets, the Agents
  // SDK bootstrap calling `setName()` via `getAgentByName`/`subAgent`) resolves the method on
  // the prototype and invokes it with the stored Durable Object instance as the receiver. When
  // the instrumented constructor returned a Proxy of the instance, native private field access
  // failed because a Proxy never carries the target's private brand.
  describe('native private fields', () => {
    it('invokes prototype RPC methods with the instance as receiver so native private fields work', () => {
      class PartyServerLike {
        #name?: string;

        setName(name: string): void {
          this.#name = name;
        }

        getName(): string | undefined {
          return this.#name;
        }
      }

      const instrumented = instrumentAgentWithSentry(
        vi.fn().mockReturnValue({ enableRpcTracePropagation: true }),
        PartyServerLike as any,
      );
      const obj = Reflect.construct(instrumented, []) as PartyServerLike;

      // This is how native RPC invokes the method: resolved on the prototype, called with the
      // instance as `this` — not fetched through a property access on the instance.
      const prototypeSetName = Object.getPrototypeOf(obj).setName as PartyServerLike['setName'];
      expect(() => Reflect.apply(prototypeSetName, obj, ['agent-1'])).not.toThrow();
      expect(obj.getName()).toBe('agent-1');
    });

    it('preserves the instance receiver on the traced RPC path so native private fields work', () => {
      const startSpanSpy = vi.spyOn(SentryCore, 'startSpan').mockImplementation((_, callback) => callback({} as any));
      vi.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);

      class WithSecret {
        #secret = 42;

        getSecret(): number {
          return this.#secret;
        }
      }

      const instrumented = instrumentDurableObjectWithSentry(
        vi.fn().mockReturnValue({ enableRpcTracePropagation: true }),
        WithSecret as any,
      );
      const obj = Reflect.construct(instrumented, []) as WithSecret;

      const rpcMeta = {
        __sentry_rpc_meta__: {
          'sentry-trace': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-1',
          baggage: '',
        },
      };

      const prototypeGetSecret = Object.getPrototypeOf(obj).getSecret as WithSecret['getSecret'];
      expect(Reflect.apply(prototypeGetSecret, obj, [rpcMeta])).toBe(42);
      expect(startSpanSpy).toHaveBeenCalled();
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
