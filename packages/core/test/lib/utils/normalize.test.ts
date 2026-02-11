/**
 * @vitest-environment jsdom
 */

import { describe, expect, test, vi } from 'vitest';
import { addNonEnumerableProperty, normalize } from '../../../src';
import * as isModule from '../../../src/utils/is';
import * as stacktraceModule from '../../../src/utils/stacktrace';

describe('normalize()', () => {
  describe('acts as a pass-through for simple-cases', () => {
    test('return same value for simple input', () => {
      expect(normalize('foo')).toEqual('foo');
      expect(normalize(42)).toEqual(42);
      expect(normalize(true)).toEqual(true);
      expect(normalize(null)).toEqual(null);
      expect(normalize(undefined)).toBeUndefined();
    });

    test('return same object or arrays for referenced inputs', () => {
      expect(normalize({ foo: 'bar' })).toEqual({ foo: 'bar' });
      expect(normalize([42])).toEqual([42]);
    });
  });

  describe('convertToPlainObject()', () => {
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

    test('extracts data from `Event` objects', () => {
      const isElement = vi.spyOn(isModule, 'isElement').mockReturnValue(true);
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

    test('circular objects with proxy', () => {
      const obj1 = { name: 'Alice', child: null } as any;
      const obj2 = { name: 'John', child: null } as any;

      function getObj1(target: any, prop: string | number | symbol): any {
        return prop === 'child'
          ? new Proxy(obj2, {
              get(t, p) {
                return getObj2(t, p);
              },
            })
          : target[prop];
      }

      function getObj2(target: any, prop: string | number | symbol): any {
        return prop === 'child'
          ? new Proxy(obj1, {
              get(t, p) {
                return getObj1(t, p);
              },
            })
          : target[prop];
      }

      const proxy1 = new Proxy(obj1, {
        get(target, prop) {
          return getObj1(target, prop);
        },
      });

      const actual = normalize(proxy1);

      // This generates 100 nested objects, as we cannot identify the circular reference since they are dynamic proxies
      // However, this test verifies that we can normalize at all, and do not fail out
      expect(actual).toEqual({
        name: 'Alice',
        child: { name: 'John', child: expect.objectContaining({ name: 'Alice', child: expect.any(Object) }) },
      });

      let last = actual;
      for (let i = 0; i < 99; i++) {
        expect(last).toEqual(
          expect.objectContaining({
            name: expect.any(String),
            child: expect.any(Object),
          }),
        );
        last = last.child;
      }

      // Last one is transformed to [Object]
      expect(last).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          child: '[Object]',
        }),
      );
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
      obj.children[0]!.self = obj.children[0];
      obj.children[1]!.self = obj.children[1];
      expect(normalize(obj)).toEqual({
        name: 'Alice',
        children: [
          { name: 'Bob', self: '[Circular ~]' },
          { name: 'Eve', self: '[Circular ~]' },
        ],
      });
    });

    test('circular arrays', () => {
      const obj: object[] = [];
      obj.push(obj);
      obj.push(obj);
      expect(normalize(obj)).toEqual(['[Circular ~]', '[Circular ~]']);
    });

    test('circular arrays with intermediaries', () => {
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

  describe("doesn't mutate the given object and skips non-enumerables", () => {
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
      circular.qux = circular.bar[0]?.baz;

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

      expect(circular.bar[0]?.baz).toBe(circular);
      expect(circular.bar[1]).toBe(circular);
      expect(circular.qux).toBe(circular.bar[0]?.baz);
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

  describe('handles HTML elements', () => {
    test('HTMLDivElement', () => {
      expect(
        normalize({
          div: document.createElement('div'),
          div2: document.createElement('div'),
        }),
      ).toEqual({
        div: '[HTMLElement: HTMLDivElement]',
        div2: '[HTMLElement: HTMLDivElement]',
      });
    });

    test('input elements', () => {
      expect(
        normalize({
          input: document.createElement('input'),
          select: document.createElement('select'),
        }),
      ).toEqual({
        input: '[HTMLElement: HTMLInputElement]',
        select: '[HTMLElement: HTMLSelectElement]',
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
      // @ts-expect-error target lacks a construct signature
      expect(normalize([{ a }, { b: new B() }, c])).toEqual([{ a: 1 }, { b: 2 }, 3]);
    });

    test('should return a normalized object even if a property was created without a prototype', () => {
      const subject = { a: 1, foo: Object.create(null), bar: Object.assign(Object.create(null), { baz: true }) } as any;
      expect(normalize(subject)).toEqual({ a: 1, foo: {}, bar: { baz: true } });
    });

    test('should return a normalized object even if toJSON throws', () => {
      const subject = { a: 1, foo: 'bar' } as any;
      subject.toJSON = () => {
        throw new Error("I'm faulty!");
      };
      expect(normalize(subject)).toEqual({ a: 1, foo: 'bar', toJSON: '[Function: <anonymous>]' });
    });

    test('should return an object without circular references when toJSON returns an object with circular references', () => {
      const subject: any = {};
      subject.toJSON = () => {
        const egg: any = {};
        egg.chicken = egg;
        return egg;
      };
      expect(normalize(subject)).toEqual({ chicken: '[Circular ~]' });
    });

    test('should detect circular reference when toJSON returns the original object', () => {
      const subject: any = {};
      subject.toJSON = () => subject;
      expect(normalize(subject)).toEqual('[Circular ~]');
    });
  });

  describe('changes unserializeable/global values/classes to their respective string representations', () => {
    test('primitive values', () => {
      expect(normalize(NaN)).toEqual('[NaN]');
      expect(normalize(Infinity)).toEqual('[Infinity]');
      expect(normalize(-Infinity)).toEqual('[-Infinity]');
      expect(normalize(Symbol('dogs'))).toEqual('[Symbol(dogs)]');
      expect(normalize(BigInt(1121201212312012))).toEqual('[BigInt: 1121201212312012]');
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
      expect(normalize(['foo', 42, NaN])).toEqual(['foo', 42, '[NaN]']);
      expect(
        normalize({
          foo: 42,
          bar: NaN,
        }),
      ).toEqual({
        foo: 42,
        bar: '[NaN]',
      });
    });

    test('primitive values in deep objects/arrays', () => {
      expect(normalize(['foo', 42, [[undefined]], [NaN]])).toEqual(['foo', 42, [[undefined]], ['[NaN]']]);
      expect(
        normalize({
          foo: 42,
          bar: {
            baz: {
              quz: null,
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
            quz: null,
          },
        },
        wat: {
          no: '[NaN]',
        },
      });
    });

    test("known classes like React's `SyntheticEvent`", () => {
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

    test('known classes like `VueViewModel`', () => {
      const obj = {
        foo: {
          _isVue: true,
        },
      };
      expect(normalize(obj)).toEqual({
        foo: '[VueViewModel]',
      });
    });

    test('null prototype', () => {
      const obj = Object.create(null);
      expect(normalize(obj, 0)).toEqual('[null prototype]');
    });

    test('null prototype base', () => {
      const base = Object.create(null);
      const obj = Object.create(base);
      expect(normalize(obj, 0)).toEqual('[null prototype]');
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

  describe('can limit max properties', () => {
    test('object', () => {
      const obj = {
        nope: 'here',
        foo: {
          one: 1,
          two: 2,
          three: 3,
          four: 4,
          five: 5,
          six: 6,
          seven: 7,
        },
        after: 'more',
      };

      expect(normalize(obj, 10, 5)).toEqual({
        nope: 'here',
        foo: {
          one: 1,
          two: 2,
          three: 3,
          four: 4,
          five: 5,
          six: '[MaxProperties ~]',
        },
        after: 'more',
      });
    });

    test('array', () => {
      const obj = {
        nope: 'here',
        foo: new Array(100).fill('s'),
        after: 'more',
      };

      expect(normalize(obj, 10, 5)).toEqual({
        nope: 'here',
        foo: ['s', 's', 's', 's', 's', '[MaxProperties ~]'],
        after: 'more',
      });
    });
  });

  describe('handles serialization errors', () => {
    test('restricts effect of error to problematic node', () => {
      vi.spyOn(stacktraceModule, 'getFunctionName').mockImplementationOnce(() => {
        throw new Error('Nope');
      });

      expect(normalize({ dogs: 'are great!', someFunc: () => {} })).toEqual({
        dogs: 'are great!',
        someFunc: '**non-serializable** (Error: Nope)',
      });
    });
  });

  test("normalizes value on every iteration of decycle and takes care of things like React's `SyntheticEvent`", () => {
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

  test('normalizes value on every iteration of decycle and takes care of things like `VueViewModel`', () => {
    const obj = {
      foo: {
        _isVue: true,
      },
      baz: NaN,
      qux: function qux(): void {
        /* no-empty */
      },
    };
    const result = normalize(obj);
    expect(result).toEqual({
      foo: '[VueViewModel]',
      baz: '[NaN]',
      qux: '[Function: qux]',
    });
  });

  describe('skips normalizing objects marked with a non-enumerable property __sentry_skip_normalization__', () => {
    test('by leaving non-serializable values intact', () => {
      const someFun = () => undefined;
      const alreadyNormalizedObj = {
        nan: NaN,
        fun: someFun,
      };

      addNonEnumerableProperty(alreadyNormalizedObj, '__sentry_skip_normalization__', true);

      const result = normalize(alreadyNormalizedObj);
      expect(result).toEqual({
        nan: NaN,
        fun: someFun,
      });
    });

    test('by ignoring normalization depth', () => {
      const alreadyNormalizedObj = {
        three: {
          more: {
            layers: '!',
          },
        },
      };

      addNonEnumerableProperty(alreadyNormalizedObj, '__sentry_skip_normalization__', true);

      const obj = {
        foo: {
          bar: {
            baz: alreadyNormalizedObj,
            boo: {
              bam: {
                pow: 'poof',
              },
            },
          },
        },
      };

      const result = normalize(obj, 4);

      expect(result?.foo?.bar?.baz?.three?.more?.layers).toBe('!');
      expect(result?.foo?.bar?.boo?.bam?.pow).not.toBe('poof');
    });
  });

  describe('overrides normalization depth with a non-enumerable property __sentry_override_normalization_depth__', () => {
    test('by increasing depth if it is higher', () => {
      const normalizationTarget = {
        foo: 'bar',
        baz: 42,
        obj: {
          obj: {
            obj: {
              bestSmashCharacter: 'Cpt. Falcon',
            },
          },
        },
      };

      addNonEnumerableProperty(normalizationTarget, '__sentry_override_normalization_depth__', 3);

      const result = normalize(normalizationTarget, 1);

      expect(result).toEqual({
        baz: 42,
        foo: 'bar',
        obj: {
          obj: {
            obj: '[Object]',
          },
        },
      });
    });

    test('by decreasing depth if it is lower', () => {
      const normalizationTarget = {
        foo: 'bar',
        baz: 42,
        obj: {
          obj: {
            obj: {
              bestSmashCharacter: 'Cpt. Falcon',
            },
          },
        },
      };

      addNonEnumerableProperty(normalizationTarget, '__sentry_override_normalization_depth__', 1);

      const result = normalize(normalizationTarget, 3);

      expect(result).toEqual({
        baz: 42,
        foo: 'bar',
        obj: '[Object]',
      });
    });
  });
});
