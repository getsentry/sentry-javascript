import { WrappedFunction } from '@sentry/types';
import { expect } from 'chai';
import { SinonSpy, spy } from 'sinon';

import { wrap } from '../../src/helpers';

describe('wrap()', () => {
  it('should wrap only functions', () => {
    const fn = () => 1337;
    const obj = { pickle: 'Rick' };
    const arr = ['Morty'];
    const str = 'Rick';
    const num = 42;

    expect(wrap(fn)).not.equal(fn);
    // @ts-ignore
    expect(wrap(obj)).equal(obj);
    // @ts-ignore
    expect(wrap(arr)).equal(arr);
    // @ts-ignore
    expect(wrap(str)).equal(str);
    // @ts-ignore
    expect(wrap(num)).equal(num);
  });

  it('should preserve correct function name when accessed', () => {
    const namedFunction = () => 1337;
    expect(wrap(namedFunction)).not.equal(namedFunction);
    expect(namedFunction.name).equal('namedFunction');
    expect(wrap(namedFunction).name).equal('namedFunction');
  });

  it('bail out with the original if accessing custom props go bad', () => {
    const fn = (() => 1337) as WrappedFunction;
    fn.__sentry__ = false;
    Object.defineProperty(fn, '__sentry_wrapped__', {
      get(): void {
        throw new Error('boom');
      },
    });

    expect(wrap(fn)).equal(fn);

    Object.defineProperty(fn, '__sentry__', {
      get(): void {
        throw new Error('boom');
      },
      configurable: true,
    });

    expect(wrap(fn)).equal(fn);
  });

  it('returns wrapped function if original was already wrapped', () => {
    const fn = (() => 1337) as WrappedFunction;
    const wrapped = wrap(fn);

    expect(wrap(fn)).equal(wrapped);
  });

  it('returns same wrapped function if trying to wrap it again', () => {
    const fn = (() => 1337) as WrappedFunction;

    const wrapped = wrap(fn);

    expect(wrap(wrapped)).equal(wrapped);
  });

  it('calls "before" function when invoking wrapped function', () => {
    const fn = (() => 1337) as WrappedFunction;
    const before = spy();

    const wrapped = wrap(fn, {}, before);
    wrapped();

    expect(before.called).equal(true);
  });

  it('attaches metadata to original and wrapped functions', () => {
    const fn = (() => 1337) as WrappedFunction;

    const wrapped = wrap(fn);

    expect(fn).to.have.property('__sentry_wrapped__');
    expect(fn.__sentry_wrapped__).equal(wrapped);

    expect(wrapped).to.have.property('__sentry__');
    expect(wrapped.__sentry__).equal(true);

    expect(wrapped).to.have.property('__sentry_original__');
    expect(wrapped.__sentry_original__).equal(fn);
  });

  it('copies over original functions properties', () => {
    const fn = (() => 1337) as WrappedFunction;
    fn.some = 1337;
    fn.property = 'Rick';

    const wrapped = wrap(fn);

    expect(wrapped).to.have.property('some');
    expect(wrapped.some).equal(1337);
    expect(wrapped).to.have.property('property');
    expect(wrapped.property).equal('Rick');
  });

  it('doesnt break when accessing original functions properties blows up', () => {
    const fn = (() => 1337) as WrappedFunction;
    Object.defineProperty(fn, 'some', {
      get(): void {
        throw new Error('boom');
      },
    });

    const wrapped = wrap(fn);

    expect(wrapped).to.not.have.property('some');
  });

  it('recrusively wraps arguments that are functions', () => {
    const fn = (() => 1337) as WrappedFunction;
    const fnArgA = () => 1337;
    const fnArgB = () => 1337;

    const wrapped = wrap(fn);
    wrapped(fnArgA, fnArgB);

    expect(fnArgA).to.have.property('__sentry_wrapped__');
    expect(fnArgB).to.have.property('__sentry_wrapped__');
  });

  it('calls either `handleEvent` property if it exists or the original function', () => {
    interface SinonEventSpy extends SinonSpy {
      handleEvent: SinonSpy;
    }

    const fn = spy();
    const eventFn = spy() as SinonEventSpy;
    eventFn.handleEvent = spy();

    wrap(fn)(123, 'Rick');
    wrap(eventFn)(123, 'Morty');

    expect(fn.called).equal(true);
    expect(fn.getCalls()[0].args[0]).equal(123);
    expect(fn.getCalls()[0].args[1]).equal('Rick');

    expect(eventFn.handleEvent.called).equal(true);
    expect(eventFn.handleEvent.getCalls()[0].args[0]).equal(123);
    expect(eventFn.handleEvent.getCalls()[0].args[1]).equal('Morty');

    expect(eventFn.called).equal(false);
  });

  it('preserves `this` context for all the calls', () => {
    const context = {
      fn(): void {
        expect(this).equal(context);
      },
      eventFn(): void {
        return;
      },
    };
    // @ts-ignore
    context.eventFn.handleEvent = function(): void {
      expect(this).equal(context);
    };

    // tslint:disable-next-line:no-unbound-method
    const wrappedFn = wrap(context.fn);
    // tslint:disable-next-line:no-unbound-method
    const wrappedEventFn = wrap(context.eventFn);

    wrappedFn.call(context);
    wrappedEventFn.call(context);
  });

  it('should rethrow caught exceptions', () => {
    const fn = () => {
      throw new Error('boom');
    };
    const wrapped = wrap(fn);

    try {
      wrapped();
    } catch (error) {
      expect(error.message).equal('boom');
    }
  });

  it('internal flags shouldnt be enumerable', () => {
    const fn = (() => 1337) as WrappedFunction;
    const wrapped = wrap(fn);

    // Shouldn't show up in iteration
    expect(Object.keys(fn)).to.not.include('__sentry__');
    expect(Object.keys(fn)).to.not.include('__sentry_original__');
    expect(Object.keys(fn)).to.not.include('__sentry_wrapped__');
    expect(Object.keys(wrapped)).to.not.include('__sentry__');
    expect(Object.keys(wrapped)).to.not.include('__sentry_original__');
    expect(Object.keys(wrapped)).to.not.include('__sentry_wrapped__');
    // But should be accessible directly
    expect(wrapped.__sentry__).to.equal(true);
    expect(wrapped.__sentry_original__).to.equal(fn);
    expect(fn.__sentry_wrapped__).to.equal(wrapped);
  });
});
