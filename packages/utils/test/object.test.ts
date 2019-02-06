import {
  clone,
  decycle,
  deserialize,
  fill,
  safeNormalize,
  serialize,
  serializeKeysToEventMessage,
  urlEncode,
} from '../src/object';

const MATRIX = [
  { name: 'boolean', object: true, serialized: 'true' },
  { name: 'number', object: 42, serialized: '42' },
  { name: 'string', object: 'test', serialized: '"test"' },
  { name: 'array', object: [1, 'test'], serialized: '[1,"test"]' },
  { name: 'object', object: { a: 'test' }, serialized: '{"a":"test"}' },
];

describe('clone()', () => {
  for (const entry of MATRIX) {
    test(`clones a ${entry.name}`, () => {
      expect(clone(entry.object)).toEqual(entry.object);
    });
  }
});

describe('decycle()', () => {
  test('decycles circular objects', () => {
    const circular = {
      foo: 1,
    };
    circular.bar = circular;

    const decycled = decycle(circular);

    expect(decycled).toEqual({
      foo: 1,
      bar: '[Circular ~]',
    });
  });

  test('decycles complex circular objects', () => {
    const circular = {
      foo: 1,
    };
    circular.bar = [
      {
        baz: circular,
      },
      circular,
    ];
    circular.qux = circular.bar[0].baz;

    const decycled = decycle(circular);

    expect(decycled).toEqual({
      bar: [
        {
          baz: '[Circular ~]',
        },
        '[Circular ~]',
      ],
      foo: 1,
      qux: '[Circular ~]',
    });
  });

  test('dont mutate original object', () => {
    const circular = {
      foo: 1,
    };
    circular.bar = circular;

    const decycled = decycle(circular);

    expect(decycled).toEqual({
      foo: 1,
      bar: '[Circular ~]',
    });
    expect(circular.bar).toEqual(circular);
  });

  test('dont mutate original complex object', () => {
    const circular = {
      foo: 1,
    };
    circular.bar = [
      {
        baz: circular,
      },
      circular,
    ];
    circular.qux = circular.bar[0].baz;

    const decycled = decycle(circular);

    expect(decycled).toEqual({
      bar: [
        {
          baz: '[Circular ~]',
        },
        '[Circular ~]',
      ],
      foo: 1,
      qux: '[Circular ~]',
    });

    expect(circular.bar[0].baz).toEqual(circular);
    expect(circular.bar[1]).toEqual(circular);
    expect(circular.qux).toEqual(circular.bar[0].baz);
  });
});

describe('serialize()', () => {
  for (const entry of MATRIX) {
    test(`serializes a ${entry.name}`, () => {
      expect(serialize(entry.object)).toEqual(entry.serialized);
    });
  }

  describe('cyclical structures', () => {
    test('circular objects', () => {
      const obj = { name: 'Alice' };
      // @ts-ignore
      obj.self = obj;
      expect(serialize(obj)).toEqual(JSON.stringify({ name: 'Alice', self: '[Circular ~]' }));
    });

    test('circular objects with intermediaries', () => {
      const obj = { name: 'Alice' };
      // @ts-ignore
      obj.identity = { self: obj };
      expect(serialize(obj)).toEqual(JSON.stringify({ name: 'Alice', identity: { self: '[Circular ~]' } }));
    });

    test('circular objects deeper', () => {
      const obj = { name: 'Alice', child: { name: 'Bob' } };
      // @ts-ignore
      obj.child.self = obj.child;
      expect(serialize(obj)).toEqual(
        JSON.stringify({
          name: 'Alice',
          child: { name: 'Bob', self: '[Circular ~]' },
        }),
      );
    });

    test('circular objects deeper with intermediaries', () => {
      const obj = { name: 'Alice', child: { name: 'Bob' } };
      // @ts-ignore
      obj.child.identity = { self: obj.child };
      expect(serialize(obj)).toEqual(
        JSON.stringify({
          name: 'Alice',
          child: { name: 'Bob', identity: { self: '[Circular ~]' } },
        }),
      );
    });

    test('circular objects in an array', () => {
      const obj = { name: 'Alice' };
      // @ts-ignore
      obj.self = [obj, obj];
      expect(serialize(obj)).toEqual(
        JSON.stringify({
          name: 'Alice',
          self: ['[Circular ~]', '[Circular ~]'],
        }),
      );
    });

    test('circular objects deeper in an array', () => {
      const obj = {
        name: 'Alice',
        children: [{ name: 'Bob' }, { name: 'Eve' }],
      };
      // @ts-ignore
      obj.children[0].self = obj.children[0];
      // @ts-ignore
      obj.children[1].self = obj.children[1];
      expect(serialize(obj)).toEqual(
        JSON.stringify({
          name: 'Alice',
          children: [{ name: 'Bob', self: '[Circular ~]' }, { name: 'Eve', self: '[Circular ~]' }],
        }),
      );
    });

    test('circular arrays', () => {
      const obj: object[] = [];
      obj.push(obj);
      obj.push(obj);
      expect(serialize(obj)).toEqual(JSON.stringify(['[Circular ~]', '[Circular ~]']));
    });

    test('circular arrays with intermediaries', () => {
      const obj: object[] = [];
      obj.push({ name: 'Alice', self: obj });
      obj.push({ name: 'Bob', self: obj });
      expect(serialize(obj)).toEqual(
        JSON.stringify([{ name: 'Alice', self: '[Circular ~]' }, { name: 'Bob', self: '[Circular ~]' }]),
      );
    });

    test('repeated objects in objects', () => {
      const obj = {};
      const alice = { name: 'Alice' };
      // @ts-ignore
      obj.alice1 = alice;
      // @ts-ignore
      obj.alice2 = alice;
      expect(serialize(obj)).toEqual(
        JSON.stringify({
          alice1: { name: 'Alice' },
          alice2: { name: 'Alice' },
        }),
      );
    });

    test('repeated objects in arrays', () => {
      const alice = { name: 'Alice' };
      const obj = [alice, alice];
      expect(serialize(obj)).toEqual(JSON.stringify([{ name: 'Alice' }, { name: 'Alice' }]));
    });
  });
});

describe('deserialize()', () => {
  for (const entry of MATRIX) {
    test(`deserializes a ${entry.name}`, () => {
      // tslint:disable:no-inferred-empty-object-type
      expect(deserialize(entry.serialized)).toEqual(entry.object);
    });
  }
});

describe('serializeKeysToEventMessage()', () => {
  test('no keys', () => {
    expect(serializeKeysToEventMessage([], 10)).toEqual('[object has no keys]');
  });

  test('one key should be returned as a whole if not over the length limit', () => {
    expect(serializeKeysToEventMessage(['foo'], 10)).toEqual('foo');
    expect(serializeKeysToEventMessage(['foobarbazx'], 10)).toEqual('foobarbazx');
  });

  test('one key should be appended with ... and truncated when over the limit', () => {
    expect(serializeKeysToEventMessage(['foobarbazqux'], 10)).toEqual('foobarbazq...');
  });

  test('multiple keys should be joined as a whole if not over the length limit', () => {
    expect(serializeKeysToEventMessage(['foo', 'bar'], 10)).toEqual('foo, bar');
  });

  test('multiple keys should include only as much keys as can fit into the limit', () => {
    expect(serializeKeysToEventMessage(['foo', 'bar', 'baz'], 10)).toEqual('foo, bar');
    expect(serializeKeysToEventMessage(['foo', 'verylongkey', 'baz'], 10)).toEqual('foo');
  });

  test('multiple keys should truncate first key if its too long', () => {
    expect(serializeKeysToEventMessage(['foobarbazqux', 'bar', 'baz'], 10)).toEqual('foobarbazq...');
  });
});

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

  test('internal flags shouldnt be enumerable', () => {
    const source = {
      foo: (): number => 42,
    };
    const name = 'foo';
    const replacement = cb => cb;

    fill(source, name, replacement);

    // Shouldn't show up in iteration
    expect(Object.keys(replacement)).not.toContain('__sentry__');
    expect(Object.keys(replacement)).not.toContain('__sentry_original__');
    expect(Object.keys(replacement)).not.toContain('__sentry_wrapped__');
    // But should be accessible directly
    expect(source.foo.__sentry__).toBe(true);
    expect(source.foo.__sentry_original__).toBe(source.foo);
    expect(source.foo.__sentry_wrapped__).toBe(source.foo);
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

describe('safeNormalize()', () => {
  test('return same value for simple input', () => {
    expect(safeNormalize('foo')).toEqual('foo');
    expect(safeNormalize(42)).toEqual(42);
    expect(safeNormalize(true)).toEqual(true);
    expect(safeNormalize(null)).toEqual(null);
  });

  test('return same object or arrays for referenced inputs', () => {
    expect(safeNormalize({ foo: 'bar' })).toEqual({ foo: 'bar' });
    expect(safeNormalize([42])).toEqual([42]);
  });

  test('return [undefined] string for undefined values', () => {
    expect(safeNormalize(undefined)).toEqual('[undefined]');
  });

  test('return [NaN] string for NaN values', () => {
    expect(safeNormalize(NaN)).toEqual('[NaN]');
  });

  test('iterates through array and object values to replace undefined/NaN values', () => {
    expect(safeNormalize(['foo', 42, undefined, NaN])).toEqual(['foo', 42, '[undefined]', '[NaN]']);
    expect(
      safeNormalize({
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

  test('iterates through array and object values, but recursively', () => {
    expect(safeNormalize(['foo', 42, [[undefined]], [NaN]])).toEqual(['foo', 42, [['[undefined]']], ['[NaN]']]);
    expect(
      safeNormalize({
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

  describe('cyclical structures', () => {
    test('must normalize circular objects', () => {
      const obj = { name: 'Alice' };
      // @ts-ignore
      obj.self = obj;
      expect(safeNormalize(obj)).toEqual({ name: 'Alice', self: '[Circular ~]' });
    });

    test('must normalize circular objects with intermediaries', () => {
      const obj = { name: 'Alice' };
      // @ts-ignore
      obj.identity = { self: obj };
      expect(safeNormalize(obj)).toEqual({ name: 'Alice', identity: { self: '[Circular ~]' } });
    });

    test('must normalize circular objects deeper', () => {
      const obj = { name: 'Alice', child: { name: 'Bob' } };
      // @ts-ignore
      obj.child.self = obj.child;
      expect(safeNormalize(obj)).toEqual({
        name: 'Alice',
        child: { name: 'Bob', self: '[Circular ~]' },
      });
    });

    test('must normalize circular objects deeper with intermediaries', () => {
      const obj = { name: 'Alice', child: { name: 'Bob' } };
      // @ts-ignore
      obj.child.identity = { self: obj.child };
      expect(safeNormalize(obj)).toEqual({
        name: 'Alice',
        child: { name: 'Bob', identity: { self: '[Circular ~]' } },
      });
    });

    test('must normalize circular objects in an array', () => {
      const obj = { name: 'Alice' };
      // @ts-ignore
      obj.self = [obj, obj];
      expect(safeNormalize(obj)).toEqual({
        name: 'Alice',
        self: ['[Circular ~]', '[Circular ~]'],
      });
    });

    test('must normalize circular objects deeper in an array', () => {
      const obj = {
        name: 'Alice',
        children: [{ name: 'Bob' }, { name: 'Eve' }],
      };
      // @ts-ignore
      obj.children[0].self = obj.children[0];
      // @ts-ignore
      obj.children[1].self = obj.children[1];
      expect(safeNormalize(obj)).toEqual({
        name: 'Alice',
        children: [{ name: 'Bob', self: '[Circular ~]' }, { name: 'Eve', self: '[Circular ~]' }],
      });
    });

    test('must normalize circular arrays', () => {
      const obj: object[] = [];
      obj.push(obj);
      obj.push(obj);
      expect(safeNormalize(obj)).toEqual(['[Circular ~]', '[Circular ~]']);
    });

    test('must normalize circular arrays with intermediaries', () => {
      const obj: object[] = [];
      obj.push({ name: 'Alice', self: obj });
      obj.push({ name: 'Bob', self: obj });
      expect(safeNormalize(obj)).toEqual([
        { name: 'Alice', self: '[Circular ~]' },
        { name: 'Bob', self: '[Circular ~]' },
      ]);
    });

    test('must normalize repeated objects in objects', () => {
      const obj = {};
      const alice = { name: 'Alice' };
      // @ts-ignore
      obj.alice1 = alice;
      // @ts-ignore
      obj.alice2 = alice;
      expect(safeNormalize(obj)).toEqual({
        alice1: { name: 'Alice' },
        alice2: { name: 'Alice' },
      });
    });

    test('must normalize repeated objects in arrays', () => {
      const alice = { name: 'Alice' };
      const obj = [alice, alice];
      expect(safeNormalize(obj)).toEqual([{ name: 'Alice' }, { name: 'Alice' }]);
    });

    test('must normalize error objects, including extra properties', () => {
      const obj = new Error('Wubba Lubba Dub Dub');
      // @ts-ignore
      obj.reason = new TypeError("I'm pickle Riiick!");
      // @ts-ignore
      obj.extra = 'some extra prop';

      // Stack is inconsistent across browsers, so override it and just make sure its stringified
      obj.stack = 'x';
      // @ts-ignore
      obj.reason.stack = 'x';

      // IE 10/11
      // @ts-ignore
      delete obj.description;
      // @ts-ignore
      delete obj.reason.description;

      const result = safeNormalize(obj);

      expect(result).toEqual({
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
  });

  test('must normalize error objects with circular references', () => {
    const obj = new Error('Wubba Lubba Dub Dub');
    // @ts-ignore
    obj.reason = obj;

    // Stack is inconsistent across browsers, so override it and just make sure its stringified
    obj.stack = 'x';
    // @ts-ignore
    obj.reason.stack = 'x';

    // IE 10/11
    // @ts-ignore
    delete obj.description;

    const result = safeNormalize(obj);

    expect(result).toEqual({
      message: 'Wubba Lubba Dub Dub',
      name: 'Error',
      stack: 'x',
      reason: '[Circular ~]',
    });
  });
});
