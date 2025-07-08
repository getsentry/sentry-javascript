import type { ExecutionContext } from '@cloudflare/workers-types';
import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { instrumentDurableObjectWithSentry } from '../src';
import { isInstrumented } from '../src/instrument';

describe('instrumentDurableObjectWithSentry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('Generic functionality', () => {
    const options = vi.fn();
    const instrumented = instrumentDurableObjectWithSentry(options, vi.fn());
    expect(instrumented).toBeTypeOf('function');
    expect(() => Reflect.construct(instrumented, [])).not.toThrow();
    expect(options).toHaveBeenCalledOnce();
  });
  it('Instruments prototype methods without "sticking" to the options', () => {
    const initCore = vi.spyOn(SentryCore, 'initAndBind');
    vi.spyOn(SentryCore, 'getClient').mockReturnValue(undefined);
    const options = vi
      .fn()
      .mockReturnValueOnce({
        orgId: 1,
      })
      .mockReturnValueOnce({
        orgId: 2,
      });
    const testClass = class {
      method() {}
    };
    (Reflect.construct(instrumentDurableObjectWithSentry(options, testClass as any), []) as any).method();
    (Reflect.construct(instrumentDurableObjectWithSentry(options, testClass as any), []) as any).method();
    expect(initCore).nthCalledWith(1, expect.any(Function), expect.objectContaining({ orgId: 1 }));
    expect(initCore).nthCalledWith(2, expect.any(Function), expect.objectContaining({ orgId: 2 }));
  });
  it('All available durable object methods are instrumented', () => {
    const testClass = class {
      propertyFunction = vi.fn();

      rpcMethod() {}

      fetch() {}

      alarm() {}

      webSocketMessage() {}

      webSocketClose() {}

      webSocketError() {}
    };
    const instrumented = instrumentDurableObjectWithSentry(vi.fn(), testClass as any);
    const obj = Reflect.construct(instrumented, []);
    expect(Object.getPrototypeOf(obj), 'Prototype is instrumented').not.toBe(testClass.prototype);
    expect(isInstrumented((obj as any)['rpcMethod']), 'RPC method').toBeFalsy();
    for (const method_name of [
      'propertyFunction',
      'fetch',
      'alarm',
      'webSocketMessage',
      'webSocketClose',
      'webSocketError',
    ]) {
      expect(isInstrumented((obj as any)[method_name]), `Method ${method_name} is instrumented`).toBeTruthy();
    }
  });
  it('flush performs after all waitUntil promises are finished', async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const flush = vi.spyOn(SentryCore.Client.prototype, 'flush');
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
    expect(() => dObject.fetch(new Request('https://example.com'))).not.toThrow();
    expect(flush).not.toBeCalled();
    expect(waitUntil).toHaveBeenCalledOnce();
    vi.advanceTimersToNextTimer();
    await Promise.all(waitUntil.mock.calls.map(([p]) => p));
    expect(flush).toBeCalled();
  });
});
