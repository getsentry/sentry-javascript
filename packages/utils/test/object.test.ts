/**
 * @jest-environment jsdom
 */

import type { WrappedFunction } from '@sentry/types';

import {
  addNonEnumerableProperty,
  dropUndefinedKeys,
  extractExceptionKeysForMessage,
  fill,
  markFunctionWrapped,
  objectify,
  urlEncode,
} from '../src/object';
import { testOnlyIfNodeVersionAtLeast } from './testutils';

describe('fill()', () => {
  test('wraps a method by calling a replacement function on it', () => {
    const source = {
      foo(): number {
        return 42;
      },
    };
    const name = 'foo';
    const replacement = jest.fn().mockImplementationOnce(cb => cb);

    fill(source, name, replacement);

    expect(source.foo()).toEqual(42);
    expect(replacement).toBeCalled();
  });

  test('can do anything inside replacement function', () => {
    const source = {
      foo: (): number => 42,
    };
    const name = 'foo';
    const replacement = jest.fn().mockImplementationOnce(cb => {
      expect(cb).toBe(source.foo);
      return () => 1337;
    });

    fill(source, name, replacement);

    expect(source.foo()).toEqual(1337);
    expect(replacement).toBeCalled();
    expect.assertions(3);
  });

  test('multiple fills calls all functions', () => {
    const source = {
      foo: (): number => 42,
    };
    const name = 'foo';
    const replacement = jest.fn().mockImplementationOnce(cb => {
      expect(cb).toBe(source.foo);
      return () => 1337;
    });

    const replacement2 = jest.fn().mockImplementationOnce(cb => {
      expect(cb).toBe(source.foo);
      return () => 1338;
    });

    fill(source, name, replacement);
    fill(source, name, replacement2);

    expect(source.foo()).toEqual(1338);
    expect(replacement).toBeCalled();
    expect(replacement2).toBeCalled();
    expect.assertions(5);
  });

  test('internal flags shouldnt be enumerable', () => {
    const source = {
      foo: (): number => 42,
    } as any;
    const name = 'foo';
    // @ts-expect-error cb has any type
    const replacement = cb => cb;

    fill(source, name, replacement);

    // Shouldn't show up in iteration
    expect(Object.keys(replacement)).not.toContain('__sentry_original__');
    // But should be accessible directly
    expect(source.foo.__sentry_original__).toBe(source.foo);
  });

  test('should preserve functions prototype if one exists', () => {
    const source = {
      foo: (): number => 42,
    };
    const bar = {};
    source.foo.prototype = bar;
    const name = 'foo';
    // @ts-expect-error cb has any type
    const replacement = cb => cb;

    fill(source, name, replacement);

    // But should be accessible directly
    expect(source.foo.prototype).toBe(bar);
  });
});

describe('urlEncode()', () => {
  test('returns empty string for empty object input', () => {
    expect(urlEncode({})).toEqual('');
  });

  test('returns single key/value pair joined with = sign', () => {
    expect(urlEncode({ foo: 'bar' })).toEqual('foo=bar');
  });

  test('returns multiple key/value pairs joined together with & sign', () => {
    expect(urlEncode({ foo: 'bar', pickle: 'rick', morty: '4 2' })).toEqual('foo=bar&pickle=rick&morty=4%202');
  });
});

describe('extractExceptionKeysForMessage()', () => {
  test('no keys', () => {
    expect(extractExceptionKeysForMessage({}, 10)).toEqual('[object has no keys]');
  });

  test('one key should be returned as a whole if not over the length limit', () => {
    expect(extractExceptionKeysForMessage({ foo: '_' }, 10)).toEqual('foo');
    expect(extractExceptionKeysForMessage({ foobarbazx: '_' }, 10)).toEqual('foobarbazx');
  });

  test('one key should be appended with ... and truncated when over the limit', () => {
    expect(extractExceptionKeysForMessage({ foobarbazqux: '_' }, 10)).toEqual('foobarbazq...');
  });

  test('multiple keys should be sorted and joined as a whole if not over the length limit', () => {
    expect(extractExceptionKeysForMessage({ foo: '_', bar: '_' }, 10)).toEqual('bar, foo');
  });

  test('multiple keys should include only as much keys as can fit into the limit', () => {
    expect(extractExceptionKeysForMessage({ foo: '_', bar: '_', baz: '_' }, 10)).toEqual('bar, baz');
    expect(extractExceptionKeysForMessage({ footoolong: '_', verylongkey: '_', baz: '_' }, 10)).toEqual('baz');
  });

  test('multiple keys should truncate first key if its too long', () => {
    expect(extractExceptionKeysForMessage({ barbazquxfoo: '_', baz: '_', qux: '_' }, 10)).toEqual('barbazquxf...');
  });
});

describe('dropUndefinedKeys()', () => {
  test('simple case', () => {
    expect(
      dropUndefinedKeys({
        a: 1,
        b: undefined,
        c: null,
        d: 'd',
      }),
    ).toStrictEqual({
      a: 1,
      c: null,
      d: 'd',
    });
  });

  test('arrays', () => {
    expect(
      dropUndefinedKeys({
        a: [
          1,
          undefined,
          {
            a: 1,
            b: undefined,
          },
        ],
      }),
    ).toStrictEqual({
      a: [
        1,
        undefined,
        {
          a: 1,
        },
      ],
    });
  });

  test('nested objects', () => {
    expect(
      dropUndefinedKeys({
        a: 1,
        b: {
          c: 2,
          d: undefined,
          e: {
            f: 3,
            g: undefined,
          },
        },
      }),
    ).toStrictEqual({
      a: 1,
      b: {
        c: 2,
        e: {
          f: 3,
        },
      },
    });
  });

  test('should not throw on objects with circular reference', () => {
    const chicken: any = {
      food: undefined,
    };

    const egg = {
      edges: undefined,
      contains: chicken,
    };

    chicken.lays = egg;

    const droppedChicken = dropUndefinedKeys(chicken);

    // Removes undefined keys
    expect(Object.keys(droppedChicken)).toEqual(['lays']);
    expect(Object.keys(droppedChicken.lays)).toEqual(['contains']);

    // Returns new object
    expect(chicken === droppedChicken).toBe(false);
    expect(chicken.lays === droppedChicken.lays).toBe(false);

    // Returns new references within objects
    expect(chicken === droppedChicken.lays.contains).toBe(false);
    expect(egg === droppedChicken.lays.contains.lays).toBe(false);

    // Keeps circular reference
    expect(droppedChicken.lays.contains === droppedChicken).toBe(true);
  });

  test('arrays with circular reference', () => {
    const egg: any[] = [];

    const chicken = {
      food: undefined,
      weight: '1kg',
      lays: egg,
    };

    egg[0] = chicken;

    const droppedChicken = dropUndefinedKeys(chicken);

    // Removes undefined keys
    expect(Object.keys(droppedChicken)).toEqual(['weight', 'lays']);
    expect(Object.keys(droppedChicken.lays)).toEqual(['0']);

    // Returns new objects
    expect(chicken === droppedChicken).toBe(false);
    expect(egg === droppedChicken.lays).toBe(false);

    // Returns new references within objects
    expect(chicken === droppedChicken.lays[0]).toBe(false);
    expect(egg === droppedChicken.lays[0].lays).toBe(false);

    // Keeps circular reference
    expect(droppedChicken.lays[0] === droppedChicken).toBe(true);
  });
});

describe('objectify()', () => {
  describe('stringifies nullish values', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
    ])('%s', (stringifiedValue, origValue): void => {
      const objectifiedNullish = objectify(origValue);

      expect(objectifiedNullish).toEqual(expect.any(String));
      expect(objectifiedNullish.valueOf()).toEqual(stringifiedValue);
    });
  });

  describe('wraps other primitives with their respective object wrapper classes', () => {
    // TODO: There's currently a bug in Jest - if you give it the `Boolean` class, it runs `typeof received ===
    // 'boolean'` but not `received instanceof Boolean` (the way it correctly does for other primitive wrappers, like
    // `Number` and `String). (See https://github.com/facebook/jest/pull/11976.) Once that is fixed and we upgrade jest,
    // we can comment the test below back in. (The tests for symbols and bigints are working only because our current
    // version of jest is sufficiently old that they're not even considered in the relevant check and just fall to the
    // default `instanceof` check jest uses for all unknown classes.)

    it.each([
      ['number', Number, 1121],
      ['string', String, 'Dogs are great!'],
      // ["boolean", Boolean, true],
      ['symbol', Symbol, Symbol('Maisey')],
    ])('%s', (_caseName, wrapperClass, primitive) => {
      const objectifiedPrimitive = objectify(primitive);

      expect(objectifiedPrimitive).toEqual(expect.any(wrapperClass));
      expect(objectifiedPrimitive.valueOf()).toEqual(primitive);
    });

    // `BigInt` doesn't exist in Node < 10, so we test it separately here.
    testOnlyIfNodeVersionAtLeast(10)('bigint', () => {
      // Hack to get around the fact that literal bigints cause a syntax error in older versions of Node, so the
      // assignment needs to not even be parsed as code in those versions
      let bigintPrimitive;
      eval('bigintPrimitive = 1231n;');

      const objectifiedBigInt = objectify(bigintPrimitive);

      expect(objectifiedBigInt).toEqual(expect.any(BigInt));
      expect(objectifiedBigInt.valueOf()).toEqual(bigintPrimitive);
    });
  });

  it('leaves objects alone', () => {
    const notAPrimitive = new Object();
    const objectifiedNonPrimtive = objectify(notAPrimitive);

    // `.toBe()` tests on identity, so this shows no wrapping has occurred
    expect(objectifiedNonPrimtive).toBe(notAPrimitive);
  });
});

describe('addNonEnumerableProperty', () => {
  it('works with a plain object', () => {
    const obj: { foo?: string } = {};
    addNonEnumerableProperty(obj, 'foo', 'bar');
    expect(obj.foo).toBe('bar');
  });

  it('works with a class', () => {
    class MyClass {
      public foo?: string;
    }
    const obj = new MyClass();
    addNonEnumerableProperty(obj as any, 'foo', 'bar');
    expect(obj.foo).toBe('bar');
  });

  it('works with a function', () => {
    const func = jest.fn();
    addNonEnumerableProperty(func as any, 'foo', 'bar');
    expect((func as any).foo).toBe('bar');
    func();
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('works with an existing property object', () => {
    const obj = { foo: 'before' };
    addNonEnumerableProperty(obj, 'foo', 'bar');
    expect(obj.foo).toBe('bar');
  });

  it('works with an existing readonly property object', () => {
    const obj = { foo: 'before' };

    Object.defineProperty(obj, 'foo', {
      value: 'defined',
      writable: false,
    });

    addNonEnumerableProperty(obj, 'foo', 'bar');
    expect(obj.foo).toBe('bar');
  });

  it('does not error with a frozen object', () => {
    const obj = Object.freeze({ foo: 'before' });

    addNonEnumerableProperty(obj, 'foo', 'bar');
    expect(obj.foo).toBe('before');
  });
});

describe('markFunctionWrapped', () => {
  it('works with a function', () => {
    const originalFunc = jest.fn();
    const wrappedFunc = jest.fn();
    markFunctionWrapped(wrappedFunc, originalFunc);

    expect((wrappedFunc as WrappedFunction).__sentry_original__).toBe(originalFunc);

    wrappedFunc();

    expect(wrappedFunc).toHaveBeenCalledTimes(1);
    expect(originalFunc).not.toHaveBeenCalled();
  });

  it('works with a frozen original function', () => {
    const originalFunc = Object.freeze(jest.fn());
    const wrappedFunc = jest.fn();
    markFunctionWrapped(wrappedFunc, originalFunc);

    expect((wrappedFunc as WrappedFunction).__sentry_original__).toBe(originalFunc);

    wrappedFunc();

    expect(wrappedFunc).toHaveBeenCalledTimes(1);
    expect(originalFunc).not.toHaveBeenCalled();
  });

  it('works with a frozen wrapped function', () => {
    const originalFunc = Object.freeze(jest.fn());
    const wrappedFunc = Object.freeze(jest.fn());
    markFunctionWrapped(wrappedFunc, originalFunc);

    // Skips adding the property, but also doesn't error
    expect((wrappedFunc as WrappedFunction).__sentry_original__).toBe(undefined);

    wrappedFunc();

    expect(wrappedFunc).toHaveBeenCalledTimes(1);
    expect(originalFunc).not.toHaveBeenCalled();
  });
});
