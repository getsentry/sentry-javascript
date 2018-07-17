import { clone, deserialize, fill, serialize, urlEncode } from '../src/object';

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

describe('serialize()', () => {
  function jsonify(obj: object): string {
    return JSON.stringify(obj);
  }

  for (const entry of MATRIX) {
    test(`serializes a ${entry.name}`, () => {
      expect(serialize(entry.object)).toEqual(entry.serialized);
    });
  }

  describe('cyclical structures', () => {
    it('must stringify circular objects', () => {
      const obj = { name: 'Alice' };
      // @ts-ignore
      obj.self = obj;

      const json = serialize(obj);
      expect(json).toEqual(jsonify({ name: 'Alice', self: '[Circular ~]' }));
    });

    it('must stringify circular objects with intermediaries', () => {
      const obj = { name: 'Alice' };
      // @ts-ignore
      obj.identity = { self: obj };
      const json = serialize(obj);
      expect(json).toEqual(jsonify({ name: 'Alice', identity: { self: '[Circular ~]' } }));
    });

    it('must stringify circular objects deeper', () => {
      const obj = { name: 'Alice', child: { name: 'Bob' } };
      // @ts-ignore
      obj.child.self = obj.child;

      expect(serialize(obj)).toEqual(
        jsonify({
          name: 'Alice',
          child: { name: 'Bob', self: '[Circular ~.child]' },
        }),
      );
    });

    it('must stringify circular objects deeper with intermediaries', () => {
      const obj = { name: 'Alice', child: { name: 'Bob' } };
      // @ts-ignore
      obj.child.identity = { self: obj.child };

      expect(serialize(obj)).toEqual(
        jsonify({
          name: 'Alice',
          child: { name: 'Bob', identity: { self: '[Circular ~.child]' } },
        }),
      );
    });

    it('must stringify circular objects in an array', () => {
      const obj = { name: 'Alice' };
      // @ts-ignore
      obj.self = [obj, obj];

      expect(serialize(obj)).toEqual(
        jsonify({
          name: 'Alice',
          self: ['[Circular ~]', '[Circular ~]'],
        }),
      );
    });

    it('must stringify circular objects deeper in an array', () => {
      const obj = {
        name: 'Alice',
        children: [{ name: 'Bob' }, { name: 'Eve' }],
      };
      // @ts-ignore
      obj.children[0].self = obj.children[0];
      // @ts-ignore
      obj.children[1].self = obj.children[1];

      expect(serialize(obj)).toEqual(
        jsonify({
          name: 'Alice',
          children: [
            { name: 'Bob', self: '[Circular ~.children.0]' },
            { name: 'Eve', self: '[Circular ~.children.1]' },
          ],
        }),
      );
    });

    it('must stringify circular arrays', () => {
      const obj: object[] = [];
      obj.push(obj);
      obj.push(obj);
      const json = serialize(obj);
      expect(json).toEqual(jsonify(['[Circular ~]', '[Circular ~]']));
    });

    it('must stringify circular arrays with intermediaries', () => {
      const obj: object[] = [];
      obj.push({ name: 'Alice', self: obj });
      obj.push({ name: 'Bob', self: obj });

      expect(serialize(obj)).toEqual(
        jsonify([{ name: 'Alice', self: '[Circular ~]' }, { name: 'Bob', self: '[Circular ~]' }]),
      );
    });

    it('must stringify repeated objects in objects', () => {
      const obj = {};
      const alice = { name: 'Alice' };
      // @ts-ignore
      obj.alice1 = alice;
      // @ts-ignore
      obj.alice2 = alice;

      expect(serialize(obj)).toEqual(
        jsonify({
          alice1: { name: 'Alice' },
          alice2: { name: 'Alice' },
        }),
      );
    });

    it('must stringify repeated objects in arrays', () => {
      const alice = { name: 'Alice' };
      const obj = [alice, alice];
      const json = serialize(obj);
      expect(json).toEqual(jsonify([{ name: 'Alice' }, { name: 'Alice' }]));
    });

    it('must stringify error objects, including extra properties', () => {
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

      // Safari doesn't allow deleting those properties from error object, yet only it provides them
      const result = serialize(obj)
        .replace(/ +"(line|column|sourceURL)": .+,?\n/g, '')
        .replace(/,\n( +)}/g, '\n$1}'); // make sure to strip trailing commas as well

      expect(result).toEqual(
        jsonify({
          message: 'Wubba Lubba Dub Dub',
          name: 'Error',
          stack: 'x',
          reason: {
            message: "I'm pickle Riiick!",
            name: 'TypeError',
            stack: 'x',
          },
          extra: 'some extra prop',
        }),
      );
    });
  });

  it('must stringify error objects with circular references', () => {
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

    // Safari doesn't allow deleting those properties from error object, yet only it provides them
    const result = serialize(obj)
      .replace(/ +"(line|column|sourceURL)": .+,?\n/g, '')
      .replace(/,\n( +)}/g, '\n$1}'); // make sure to strip trailing commas as well

    expect(result).toEqual(
      jsonify({
        message: 'Wubba Lubba Dub Dub',
        name: 'Error',
        stack: 'x',
        reason: '[Circular ~]',
      }),
    );
  });
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
