import {
  isDOMError,
  isDOMException,
  isError,
  isErrorEvent,
  isInstanceOf,
  isPlainObject,
  isPrimitive,
  isThenable,
  isVueViewModel,
} from '../../src/utils-hoist/is';
import { supportsDOMError, supportsDOMException, supportsErrorEvent } from '../../src/utils-hoist/supports';
import { resolvedSyncPromise } from '../../src/utils-hoist/syncpromise';
import { testOnlyIfNodeVersionAtLeast } from './testutils';

class SentryError extends Error {
  public name: string;

  public constructor(public message: string) {
    super(message);
    this.name = new.target.prototype.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

if (supportsDOMError()) {
  describe('isDOMError()', () => {
    test('should work as advertised', () => {
      expect(isDOMError(new Error())).toEqual(false);
      // @ts-expect-error See: src/supports.ts for details
      expect(isDOMError(new DOMError(''))).toEqual(true);
    });
  });
}

if (supportsDOMException()) {
  describe('isDOMException()', () => {
    test('should work as advertised', () => {
      expect(isDOMException(new Error())).toEqual(false);
      expect(isDOMException(new DOMException(''))).toEqual(true);
    });
  });
}

describe('isError()', () => {
  test('should work as advertised', () => {
    expect(isError(new Error())).toEqual(true);
    expect(isError(new ReferenceError())).toEqual(true);
    expect(isError(new SentryError('message'))).toEqual(true);
    expect(isError({})).toEqual(false);
    expect(
      isError({
        message: 'A fake error',
        stack: 'no stack here',
      }),
    ).toEqual(false);
    expect(isError('')).toEqual(false);
    expect(isError(true)).toEqual(false);
  });

  testOnlyIfNodeVersionAtLeast(18)('should detect WebAssembly.Exceptions', () => {
    // https://developer.mozilla.org/en-US/docs/WebAssembly/JavaScript_interface/Exception/Exception#examples
    // @ts-expect-error - WebAssembly.Tag is a valid constructor
    const tag = new WebAssembly.Tag({ parameters: ['i32', 'f32'] });
    // @ts-expect-error - WebAssembly.Exception is a valid constructor
    expect(isError(new WebAssembly.Exception(tag, [42, 42.3]))).toBe(true);
  });
});

if (supportsErrorEvent()) {
  describe('isErrorEvent()', () => {
    test('should work as advertised', () => {
      expect(isErrorEvent(new Error())).toEqual(false);
      expect(isErrorEvent(new ErrorEvent(''))).toEqual(true);
    });
  });
}

describe('isPrimitive()', () => {
  test('should work as advertised', () => {
    expect(isPrimitive(undefined)).toEqual(true);
    expect(isPrimitive(null)).toEqual(true);
    expect(isPrimitive(true)).toEqual(true);
    expect(isPrimitive('foo')).toEqual(true);
    expect(isPrimitive(42)).toEqual(true);

    expect(isPrimitive({})).toEqual(false);
    expect(isPrimitive([])).toEqual(false);
    expect(isPrimitive(new Error('foo'))).toEqual(false);
    expect(isPrimitive(new Date())).toEqual(false);
  });
});

describe('isThenable()', () => {
  test('should work as advertised', () => {
    expect(isThenable(Promise.resolve(true))).toEqual(true);
    expect(isThenable(resolvedSyncPromise(true))).toEqual(true);

    expect(isThenable(undefined)).toEqual(false);
    expect(isThenable(null)).toEqual(false);
    expect(isThenable(true)).toEqual(false);
    expect(isThenable('foo')).toEqual(false);
    expect(isThenable(42)).toEqual(false);
    expect(isThenable({})).toEqual(false);
    expect(isThenable([])).toEqual(false);
    expect(isThenable(new Error('foo'))).toEqual(false);
    expect(isThenable(new Date())).toEqual(false);
  });
});

describe('isInstanceOf()', () => {
  test('should work as advertised', () => {
    function Foo(): void {
      /* no-empty */
    }
    expect(isInstanceOf(new Error('wat'), Error)).toEqual(true);
    expect(isInstanceOf(new Date(), Date)).toEqual(true);
    // @ts-expect-error Foo implicity has any type, doesn't have constructor
    expect(isInstanceOf(new Foo(), Foo)).toEqual(true);

    expect(isInstanceOf(new Error('wat'), Foo)).toEqual(false);
    expect(isInstanceOf(new Date('wat'), Error)).toEqual(false);
  });

  test('should not break with incorrect input', () => {
    expect(isInstanceOf(new Error('wat'), 1)).toEqual(false);
    expect(isInstanceOf(new Error('wat'), 'wat')).toEqual(false);
    expect(isInstanceOf(new Error('wat'), null)).toEqual(false);
    expect(isInstanceOf(new Error('wat'), undefined)).toEqual(false);
  });
});

describe('isVueViewModel()', () => {
  test('should work as advertised', () => {
    expect(isVueViewModel({ _isVue: true })).toEqual(true);
    expect(isVueViewModel({ __isVue: true })).toEqual(true);

    expect(isVueViewModel({ foo: true })).toEqual(false);
  });
});

describe('isPlainObject', () => {
  class MyClass {
    public foo: string = 'bar';
  }

  it.each([
    [{}, true],
    [true, false],
    [false, false],
    [undefined, false],
    [null, false],
    ['', false],
    [1, false],
    [0, false],
    [{ aha: 'yes' }, true],
    [new Object({ aha: 'yes' }), true],
    [new String('aa'), false],
    [new MyClass(), true],
    [{ ...new MyClass() }, true],
  ])('%s is %s', (value, expected) => {
    expect(isPlainObject(value)).toBe(expected);
  });
});
