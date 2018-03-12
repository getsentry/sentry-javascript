import { clone, deserialize, serialize } from '../src';

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
