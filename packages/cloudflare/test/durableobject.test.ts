import type { ExecutionContext } from '@cloudflare/workers-types';
import * as SentryCore from '@sentry/core';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { instrumentDurableObjectWithSentry } from '../src/durableobject';
import { isInstrumented } from '../src/instrument';

describe('durable object', () => {
  it('instrumentDurableObjectWithSentry generic functionality', () => {
    const options = vi.fn();
    const instrumented = instrumentDurableObjectWithSentry(options, vi.fn());
    expect(instrumented).toBeTypeOf('function');
    expect(() => Reflect.construct(instrumented, [])).not.toThrow();
    expect(options).toHaveBeenCalledOnce();
  });
  it('all available durable object methods are instrumented', () => {
    const testClass = vi.fn(() => ({
      customMethod: vi.fn(),
      fetch: vi.fn(),
      alarm: vi.fn(),
      webSocketMessage: vi.fn(),
      webSocketClose: vi.fn(),
      webSocketError: vi.fn(),
    }));
    const instrumented = instrumentDurableObjectWithSentry(vi.fn(), testClass as any);
    const dObject: any = Reflect.construct(instrumented, []);
    for (const method of Object.getOwnPropertyNames(dObject)) {
      expect(isInstrumented(dObject[method]), `Method ${method} is instrumented`).toBeTruthy();
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
