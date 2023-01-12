import type { WrappedFunction } from '@sentry/types';
import { spy } from 'sinon';

import { wrap } from '../../../src/helpers';

describe('internal wrap()', () => {
  it('should wrap only functions', () => {
    const fn = (): number => 1337;
    const obj = { pickle: 'Rick' };
    const arr = ['Morty'];
    const str = 'Rick';
    const num = 42;

    expect(wrap(fn)).not.toBe(fn);
    // @ts-ignore Issue with `WrappedFunction` type from wrap fn
    expect(wrap(obj)).toBe(obj);
    // @ts-ignore Issue with `WrappedFunction` type from wrap fn
    expect(wrap(arr)).toBe(arr);
    // @ts-ignore Issue with `WrappedFunction` type from wrap fn
    expect(wrap(str)).toBe(str);
    // @ts-ignore Issue with `WrappedFunction` type from wrap fn
    expect(wrap(num)).toBe(num);
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

  it('calls "before" function when invoking wrapped function', () => {
    const fn = (() => 1337) as WrappedFunction;
    const before = spy();

    const wrapped = wrap(fn, {}, before);
    wrapped();

    expect(before.called).toBe(true);
  });

  it('attaches metadata to original and wrapped functions', () => {
    const fn = (() => 1337) as WrappedFunction;

    const wrapped = wrap(fn);

    expect(fn).toHaveProperty('__sentry_wrapped__');
    expect(fn.__sentry_wrapped__).toBe(wrapped);

    expect(wrapped).toHaveProperty('__sentry_original__');
    expect(wrapped.__sentry_original__).toBe(fn);
  });

  it('copies over original functions properties', () => {
    const fn = (() => 1337) as WrappedFunction;
    fn.some = 1337;
    fn.property = 'Rick';

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
    const fn = (() => 1337) as WrappedFunction;
    const fnArgA = (): number => 1337;
    const fnArgB = (): number => 1337;

    const wrapped = wrap(fn);
    wrapped(fnArgA, fnArgB);

    expect(fnArgA).toHaveProperty('__sentry_wrapped__');
    expect(fnArgB).toHaveProperty('__sentry_wrapped__');
  });

  it('calls the original function', () => {
    const fn = spy();

    wrap(fn)(123, 'Rick');

    expect(fn.called).toBe(true);
    expect(fn.getCalls()[0].args[0]).toBe(123);
    expect(fn.getCalls()[0].args[1]).toBe('Rick');
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
    // @ts-ignore eventFn does not have property handleEvent
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
      expect(error.message).toBe('boom');
    }
  });

  it('internal flags shouldnt be enumerable', () => {
    const fn = (() => 1337) as WrappedFunction;
    const wrapped = wrap(fn);

    // Shouldn't show up in iteration
    expect(Object.keys(fn)).toEqual(expect.not.arrayContaining(['__sentry_original__']));
    expect(Object.keys(fn)).toEqual(expect.not.arrayContaining(['__sentry_wrapped__']));
    expect(Object.keys(wrapped)).toEqual(expect.not.arrayContaining(['__sentry_original__']));
    expect(Object.keys(wrapped)).toEqual(expect.not.arrayContaining(['__sentry_wrapped__']));
    // But should be accessible directly
    expect(wrapped.__sentry_original__).toBe(fn);
    expect(fn.__sentry_wrapped__).toBe(wrapped);
  });
});
