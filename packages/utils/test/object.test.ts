/**
 * @jest-environment jsdom
 */

import * as isModule from '../src/is';
import {
  dropUndefinedKeys,
  extractExceptionKeysForMessage,
  fill,
  normalize,
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
    // @ts-ignore cb has any type
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
    // @ts-ignore cb has any type
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

describe('normalize()', () => {
  describe('acts as a pass-through for simple-cases', () => {
    test('return same value for simple input', () => {
      expect(normalize('foo')).toEqual('foo');
      expect(normalize(42)).toEqual(42);
      expect(normalize(true)).toEqual(true);
      expect(normalize(null)).toEqual(null);
    });

    test('return same object or arrays for referenced inputs', () => {
      expect(normalize({ foo: 'bar' })).toEqual({ foo: 'bar' });
      expect(normalize([42])).toEqual([42]);
    });
  });

  describe('getWalkSource()', () => {
    test('extracts extra properties from error objects', () => {
      const obj = new Error('Wubba Lubba Dub Dub') as any;
      obj.reason = new TypeError("I'm pickle Riiick!");
      obj.extra = 'some extra prop';

      obj.stack = 'x';
      obj.reason.stack = 'x';

      // IE 10/11
      delete obj.description;
      delete obj.reason.description;

      expect(normalize(obj)).toEqual({
        message: 'Wubba Lubba Dub Dub',
        name: 'Error',
        stack: 'x',
        reason: {
          message: "I'm pickle Riiick!",
          name: 'TypeError',
          stack: 'x',
        },
        extra: 'some extra prop',
      });
    });

    testOnlyIfNodeVersionAtLeast(8)('extracts data from `Event` objects', () => {
      const isElement = jest.spyOn(isModule, 'isElement').mockReturnValue(true);
      const getAttribute = () => undefined;

      const parkElement = { tagName: 'PARK', getAttribute };
      const treeElement = { tagName: 'TREE', parentNode: parkElement, getAttribute };
      const squirrelElement = { tagName: 'SQUIRREL', parentNode: treeElement, getAttribute };

      const chaseEvent = new Event('chase');
      Object.defineProperty(chaseEvent, 'target', { value: squirrelElement });
      Object.defineProperty(chaseEvent, 'currentTarget', { value: parkElement });
      Object.defineProperty(chaseEvent, 'wagging', { value: true, enumerable: false });

      expect(normalize(chaseEvent)).toEqual({
        currentTarget: 'park',
        isTrusted: false,
        target: 'park > tree > squirrel',
        type: 'chase',
        // notice that `wagging` isn't included because it's not enumerable and not one of the ones we specifically extract
      });

      isElement.mockRestore();
    });
  });

  describe('decycles cyclical structures', () => {
    test('circular objects', () => {
      const obj = { name: 'Alice' } as any;
      obj.self = obj;
      expect(normalize(obj)).toEqual({ name: 'Alice', self: '[Circular ~]' });
    });

    test('circular objects with intermediaries', () => {
      const obj = { name: 'Alice' } as any;
      obj.identity = { self: obj };
      expect(normalize(obj)).toEqual({ name: 'Alice', identity: { self: '[Circular ~]' } });
    });

    test('deep circular objects', () => {
      const obj = { name: 'Alice', child: { name: 'Bob' } } as any;
      obj.child.self = obj.child;
      expect(normalize(obj)).toEqual({
        name: 'Alice',
        child: { name: 'Bob', self: '[Circular ~]' },
      });
    });

    test('deep circular objects with intermediaries', () => {
      const obj = { name: 'Alice', child: { name: 'Bob' } } as any;
      obj.child.identity = { self: obj.child };
      expect(normalize(obj)).toEqual({
        name: 'Alice',
        child: { name: 'Bob', identity: { self: '[Circular ~]' } },
      });
    });

    test('circular objects in an array', () => {
      const obj = { name: 'Alice' } as any;
      obj.self = [obj, obj];
      expect(normalize(obj)).toEqual({
        name: 'Alice',
        self: ['[Circular ~]', '[Circular ~]'],
      });
    });

    test('deep circular objects in an array', () => {
      const obj = {
        name: 'Alice',
        children: [{ name: 'Bob' }, { name: 'Eve' }],
      } as any;
      obj.children[0].self = obj.children[0];
      obj.children[1].self = obj.children[1];
      expect(normalize(obj)).toEqual({
        name: 'Alice',
        children: [
          { name: 'Bob', self: '[Circular ~]' },
          { name: 'Eve', self: '[Circular ~]' },
        ],
      });
    });

    test('circular arrays', () => {
      // eslint-disable-next-line @typescript-eslint/ban-types
      const obj: object[] = [];
      obj.push(obj);
      obj.push(obj);
      expect(normalize(obj)).toEqual(['[Circular ~]', '[Circular ~]']);
    });

    test('circular arrays with intermediaries', () => {
      // eslint-disable-next-line @typescript-eslint/ban-types
      const obj: object[] = [];
      obj.push({ name: 'Alice', self: obj });
      obj.push({ name: 'Bob', self: obj });
      expect(normalize(obj)).toEqual([
        { name: 'Alice', self: '[Circular ~]' },
        { name: 'Bob', self: '[Circular ~]' },
      ]);
    });

    test('repeated objects in objects', () => {
      const obj = {} as any;
      const alice = { name: 'Alice' };
      obj.alice1 = alice;
      obj.alice2 = alice;
      expect(normalize(obj)).toEqual({
        alice1: { name: 'Alice' },
        alice2: { name: 'Alice' },
      });
    });

    test('repeated objects in arrays', () => {
      const alice = { name: 'Alice' };
      const obj = [alice, alice];
      expect(normalize(obj)).toEqual([{ name: 'Alice' }, { name: 'Alice' }]);
    });

    test('error objects with circular references', () => {
      const obj = new Error('Wubba Lubba Dub Dub') as any;
      obj.reason = obj;

      obj.stack = 'x';
      obj.reason.stack = 'x';

      // IE 10/11
      delete obj.description;

      expect(normalize(obj)).toEqual({
        message: 'Wubba Lubba Dub Dub',
        name: 'Error',
        stack: 'x',
        reason: '[Circular ~]',
      });
    });
  });

  describe('dont mutate and skip non-enumerables', () => {
    test('simple object', () => {
      const circular = {
        foo: 1,
      } as any;
      circular.bar = circular;

      const normalized = normalize(circular);
      expect(normalized).toEqual({
        foo: 1,
        bar: '[Circular ~]',
      });

      expect(circular.bar).toBe(circular);
      expect(normalized).not.toBe(circular);
    });

    test('complex object', () => {
      const circular = {
        foo: 1,
      } as any;
      circular.bar = [
        {
          baz: circular,
        },
        circular,
      ];
      circular.qux = circular.bar[0].baz;

      const normalized = normalize(circular);
      expect(normalized).toEqual({
        bar: [
          {
            baz: '[Circular ~]',
          },
          '[Circular ~]',
        ],
        foo: 1,
        qux: '[Circular ~]',
      });

      expect(circular.bar[0].baz).toBe(circular);
      expect(circular.bar[1]).toBe(circular);
      expect(circular.qux).toBe(circular.bar[0].baz);
      expect(normalized).not.toBe(circular);
    });

    test('object with non-enumerable properties', () => {
      const circular = {
        foo: 1,
      } as any;
      circular.bar = circular;
      circular.baz = {
        one: 1337,
      };
      Object.defineProperty(circular, 'qux', {
        enumerable: true,
        value: circular,
      });
      Object.defineProperty(circular, 'quaz', {
        enumerable: false,
        value: circular,
      });
      Object.defineProperty(circular.baz, 'two', {
        enumerable: false,
        value: circular,
      });

      expect(normalize(circular)).toEqual({
        bar: '[Circular ~]',
        baz: {
          one: 1337,
        },
        foo: 1,
        qux: '[Circular ~]',
      });
    });
  });

  describe('calls toJSON if implemented', () => {
    test('primitive values', () => {
      const a = new Number(1) as any;
      a.toJSON = () => 10;
      const b = new String('2') as any;
      b.toJSON = () => '20';
      expect(normalize(a)).toEqual(10);
      expect(normalize(b)).toEqual('20');
    });

    test('objects, arrays and classes', () => {
      const a = Object.create({});
      a.toJSON = () => 1;
      function B(): void {
        /* no-empty */
      }
      B.prototype.toJSON = () => 2;
      const c: any = [];
      c.toJSON = () => 3;
      // @ts-ignore target lacks a construct signature
      expect(normalize([{ a }, { b: new B() }, c])).toEqual([{ a: 1 }, { b: 2 }, 3]);
    });
  });

  describe('changes unserializeable/global values/classes to its string representation', () => {
    test('primitive values', () => {
      expect(normalize(undefined)).toEqual('[undefined]');
      expect(normalize(NaN)).toEqual('[NaN]');
    });

    test('functions', () => {
      expect(
        normalize(() => {
          /* no-empty */
        }),
      ).toEqual('[Function: <anonymous>]');
      const foo = () => {
        /* no-empty */
      };
      expect(normalize(foo)).toEqual('[Function: foo]');
    });

    test('primitive values in objects/arrays', () => {
      expect(normalize(['foo', 42, undefined, NaN])).toEqual(['foo', 42, '[undefined]', '[NaN]']);
      expect(
        normalize({
          foo: 42,
          bar: undefined,
          baz: NaN,
        }),
      ).toEqual({
        foo: 42,
        bar: '[undefined]',
        baz: '[NaN]',
      });
    });

    test('primitive values in deep objects/arrays', () => {
      expect(normalize(['foo', 42, [[undefined]], [NaN]])).toEqual(['foo', 42, [['[undefined]']], ['[NaN]']]);
      expect(
        normalize({
          foo: 42,
          bar: {
            baz: {
              quz: undefined,
            },
          },
          wat: {
            no: NaN,
          },
        }),
      ).toEqual({
        foo: 42,
        bar: {
          baz: {
            quz: '[undefined]',
          },
        },
        wat: {
          no: '[NaN]',
        },
      });
    });

    test('known Classes like Reacts SyntheticEvents', () => {
      const obj = {
        foo: {
          nativeEvent: 'wat',
          preventDefault: 'wat',
          stopPropagation: 'wat',
        },
      };
      expect(normalize(obj)).toEqual({
        foo: '[SyntheticEvent]',
      });
    });
  });

  describe('can limit object to depth', () => {
    test('single level', () => {
      const obj = {
        foo: [],
      };

      expect(normalize(obj, 1)).toEqual({
        foo: '[Array]',
      });
    });

    test('two levels', () => {
      const obj = {
        foo: [1, 2, []],
      };

      expect(normalize(obj, 2)).toEqual({
        foo: [1, 2, '[Array]'],
      });
    });

    test('multiple levels with various inputs', () => {
      const obj = {
        foo: {
          bar: {
            baz: 1,
            qux: [
              {
                rick: 'morty',
              },
            ],
          },
        },
        bar: 1,
        baz: [
          {
            something: 'else',
            fn: () => {
              /* no-empty */
            },
          },
        ],
      };

      expect(normalize(obj, 3)).toEqual({
        bar: 1,
        baz: [
          {
            something: 'else',
            fn: '[Function: fn]',
          },
        ],
        foo: {
          bar: {
            baz: 1,
            qux: '[Array]',
          },
        },
      });
    });
  });

  test('normalizes value on every iteration of decycle and takes care of things like Reacts SyntheticEvents', () => {
    const obj = {
      foo: {
        nativeEvent: 'wat',
        preventDefault: 'wat',
        stopPropagation: 'wat',
      },
      baz: NaN,
      qux: function qux(): void {
        /* no-empty */
      },
    };
    const result = normalize(obj);
    expect(result).toEqual({
      foo: '[SyntheticEvent]',
      baz: '[NaN]',
      qux: '[Function: qux]',
    });
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
