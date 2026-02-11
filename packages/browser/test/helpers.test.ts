import type { WrappedFunction } from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import { wrap } from '../src/helpers';

describe('internal wrap()', () => {
  it('should wrap only functions', () => {
    const fn = (): number => 1337;
    const obj = { pickle: 'Rick' };
    const arr = ['Morty'];
    const str = 'Rick';
    const num = 42;

    expect(wrap(fn)).not.toBe(fn);
    expect(wrap(obj)).toBe(obj);
    expect(wrap(arr)).toBe(arr);
    expect(wrap(str)).toBe(str);
    expect(wrap(num)).toBe(num);
  });

  it('correctly infers types', () => {
    const a = wrap(42);
    expect(a > 40).toBe(true);

    const b = wrap('42');
    expect(b.length).toBe(2);

    const c = wrap(() => 42);
    expect(c()).toBe(42);
    expect(c.__sentry_original__).toBeInstanceOf(Function);
  });

  it('should preserve correct function name when accessed', () => {
    const namedFunction = (): number => 1337;
    expect(wrap(namedFunction)).not.toBe(namedFunction);
    expect(namedFunction.name).toBe('namedFunction');
    expect(wrap(namedFunction).name).toBe('namedFunction');
  });

  it('bail out with the original if accessing custom props go bad', () => {
    const fn = (() => 1337) as WrappedFunction;
    Object.defineProperty(fn, '__sentry_wrapped__', {
      get(): void {
        throw new Error('boom');
      },
    });

    expect(wrap(fn)).toBe(fn);
  });

  it('returns wrapped function if original was already wrapped', () => {
    const fn = (() => 1337) as WrappedFunction;
    const wrapped = wrap(fn);

    expect(wrap(fn)).toBe(wrapped);
  });

  it('returns same wrapped function if trying to wrap it again', () => {
    const fn = (() => 1337) as WrappedFunction;

    const wrapped = wrap(fn);

    expect(wrap(wrapped)).toBe(wrapped);
  });

  it('attaches metadata to original and wrapped functions', () => {
    const fn = (() => 1337) as WrappedFunction;

    const wrapped = wrap(fn);

    expect(fn).toHaveProperty('__sentry_wrapped__');
    expect(fn.__sentry_wrapped__).toBe(wrapped);

    expect(wrapped).toHaveProperty('__sentry_original__');
    expect(wrapped.__sentry_original__).toBe(fn);
  });

  it('keeps original functions properties', () => {
    const fn = Object.assign(() => 1337, {
      some: 1337,
      property: 'Rick',
    });

    const wrapped = wrap(fn);

    expect(wrapped).toHaveProperty('some');
    expect(wrapped.some).toBe(1337);
    expect(wrapped).toHaveProperty('property');
    expect(wrapped.property).toBe('Rick');
  });

  it('doesnt break when accessing original functions properties blows up', () => {
    const fn = (() => 1337) as WrappedFunction;
    Object.defineProperty(fn, 'some', {
      get(): void {
        throw new Error('boom');
      },
    });

    const wrapped = wrap(fn);

    expect(wrapped).not.toHaveProperty('some');
  });

  it('recrusively wraps arguments that are functions', () => {
    const fn = (_arg1: unknown, _arg2: unknown) => 1337;
    const fnArgA = (): number => 1337;
    const fnArgB = (): number => 1337;

    const wrapped = wrap(fn);
    wrapped(fnArgA, fnArgB);

    expect(fnArgA).toHaveProperty('__sentry_wrapped__');
    expect(fnArgB).toHaveProperty('__sentry_wrapped__');
  });

  it('calls the original function', () => {
    const fn = vi.fn();

    wrap(fn)(123, 'Rick');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(123, 'Rick');
  });

  it('preserves `this` context for all the calls', () => {
    const context = {
      fn(): void {
        expect(this).toBe(context);
      },
      eventFn(): void {
        return;
      },
    };
    // @ts-expect-error eventFn does not have property handleEvent
    context.eventFn.handleEvent = function (): void {
      expect(this).toBe(context);
    };

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const wrappedFn = wrap(context.fn);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const wrappedEventFn = wrap(context.eventFn);

    wrappedFn.call(context);
    wrappedEventFn.call(context);
  });

  it('should rethrow caught exceptions', () => {
    const fn = (): number => {
      throw new Error('boom');
    };
    const wrapped = wrap(fn);

    try {
      wrapped();
    } catch (error) {
      expect((error as Error).message).toBe('boom');
    }
  });

  it('internal flags shouldnt be enumerable', () => {
    const fn = () => 1337;
    const wrapped = wrap(fn);

    // Shouldn't show up in iteration
    expect(Object.keys(fn)).toEqual(expect.not.arrayContaining(['__sentry_original__']));
    expect(Object.keys(fn)).toEqual(expect.not.arrayContaining(['__sentry_wrapped__']));
    expect(Object.keys(wrapped)).toEqual(expect.not.arrayContaining(['__sentry_original__']));
    expect(Object.keys(wrapped)).toEqual(expect.not.arrayContaining(['__sentry_wrapped__']));
    // But should be accessible directly
    expect(wrapped.__sentry_original__).toBe(fn);
    expect((fn as WrappedFunction).__sentry_wrapped__).toBe(wrapped);
  });

  it('should only return __sentry_wrapped__ when it is a function', () => {
    const fn = (() => 1337) as WrappedFunction;

    wrap(fn);
    expect(fn).toHaveProperty('__sentry_wrapped__');
    fn.__sentry_wrapped__ = 'something that is not a function' as any;

    const wrapped = wrap(fn);

    expect(wrapped).toBe(fn);
    expect(wrapped).not.toBe('something that is not a function');
  });
});
