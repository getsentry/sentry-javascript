import { clone, deserialize, fill, serialize, urlEncode } from '../src';

const MATRIX = [
  { name: 'boolean', object: true, serialized: 'true' },
  { name: 'number', object: 42, serialized: '42' },
  { name: 'string', object: 'test', serialized: '"test"' },
  { name: 'array', object: [1, 'test'], serialized: '[1,"test"]' },
  { name: 'object', object: { a: 'test' }, serialized: '{"a":"test"}' },
  // TODO: Add tests for cyclic and deep objects
];

describe('clone()', () => {
  for (const entry of MATRIX) {
    test(`clones a ${entry.name}`, () => {
      expect(clone(entry.object)).toEqual(entry.object);
    });
  }
});

describe('serialize()', () => {
  for (const entry of MATRIX) {
    test(`serializes a ${entry.name}`, () => {
      expect(serialize(entry.object)).toEqual(entry.serialized);
    });
  }
});

describe('deserialize()', () => {
  for (const entry of MATRIX) {
    test(`deserializes a ${entry.name}`, () => {
      expect(deserialize(entry.serialized)).toEqual(entry.object);
    });
  }
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

  test('stores reference to unwrapped function', () => {
    const source = {
      foo(): number {
        return 42;
      },
    };
    const name = 'foo';
    const replacement = jest.fn().mockImplementationOnce(() => () => 1337);
    const wrapped: Array<[{ [key: string]: any }, string, any]> = [];

    fill(source, name, replacement, wrapped);
    expect(source.foo()).toEqual(1337);
    expect(replacement).toBeCalled();

    const original = wrapped[0];
    expect(original[0]).toEqual(source);
    expect(original[1]).toEqual('foo');
    expect(original[2]()).toEqual(42);
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
    expect(urlEncode({ foo: 'bar', pickle: 'rick', morty: '4 2' })).toEqual(
      'foo=bar&pickle=rick&morty=4%202',
    );
  });
});
