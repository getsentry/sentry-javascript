import { describe, expect, it } from 'vitest';
import { attributeValueToTypedAttributeValue, isAttributeObject } from '../../src/attributes';

describe('attributeValueToTypedAttributeValue', () => {
  describe('primitive values', () => {
    it('converts a string value to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue('test');
      expect(result).toStrictEqual({
        value: 'test',
        type: 'string',
      });
    });

    it('converts an interger number value to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue(42);
      expect(result).toStrictEqual({
        value: 42,
        type: 'integer',
      });
    });

    it('converts a double number value to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue(42.34);
      expect(result).toStrictEqual({
        value: 42.34,
        type: 'double',
      });
    });

    it('converts a boolean value to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue(true);
      expect(result).toStrictEqual({
        value: true,
        type: 'boolean',
      });
    });
  });

  describe('arrays', () => {
    it('converts an array of strings to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue(['foo', 'bar']);
      expect(result).toStrictEqual({
        value: ['foo', 'bar'],
        type: 'string[]',
      });
    });

    it('converts an array of integer numbers to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue([1, 2, 3]);
      expect(result).toStrictEqual({
        value: [1, 2, 3],
        type: 'integer[]',
      });
    });

    it('converts an array of double numbers to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue([1.1, 2.2, 3.3]);
      expect(result).toStrictEqual({
        value: [1.1, 2.2, 3.3],
        type: 'double[]',
      });
    });

    it('converts an array of booleans to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue([true, false, true]);
      expect(result).toStrictEqual({
        value: [true, false, true],
        type: 'boolean[]',
      });
    });
  });

  describe('attribute objects without units', () => {
    // Note: These tests only test exemplar type and fallback behaviour (see above for more cases)
    it('converts a primitive value to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue({ value: 123.45 });
      expect(result).toStrictEqual({
        value: 123.45,
        type: 'double',
      });
    });

    it('converts an array of primitive values to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue({ value: [true, false] });
      expect(result).toStrictEqual({
        value: [true, false],
        type: 'boolean[]',
      });
    });

    it('converts an unsupported object value to a string attribute value', () => {
      const result = attributeValueToTypedAttributeValue({ value: { foo: 'bar' } });
      expect(result).toStrictEqual({
        value: '{"foo":"bar"}',
        type: 'string',
      });
    });
  });

  describe('attribute objects with units', () => {
    // Note: These tests only test exemplar type and fallback behaviour (see above for more cases)
    it('converts a primitive value to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue({ value: 123.45, unit: 'ms' });
      expect(result).toStrictEqual({
        value: 123.45,
        type: 'double',
        unit: 'ms',
      });
    });

    it('converts an array of primitive values to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue({ value: [true, false], unit: 'count' });
      expect(result).toStrictEqual({
        value: [true, false],
        type: 'boolean[]',
        unit: 'count',
      });
    });

    it('converts an unsupported object value to a string attribute value', () => {
      const result = attributeValueToTypedAttributeValue({ value: { foo: 'bar' }, unit: 'bytes' });
      expect(result).toStrictEqual({
        value: '{"foo":"bar"}',
        type: 'string',
        unit: 'bytes',
      });
    });

    it('extracts the value property of an object with a value property', () => {
      // and ignores other properties.
      // For now we're fine with this but we may reconsider in the future.
      const result = attributeValueToTypedAttributeValue({ value: 'foo', unit: 'ms', bar: 'baz' });
      expect(result).toStrictEqual({
        value: 'foo',
        unit: 'ms',
        type: 'string',
      });
    });
  });

  describe('unsupported value types', () => {
    it('stringifies mixed float and integer numbers to a string attribute value', () => {
      const result = attributeValueToTypedAttributeValue([1, 2.2, 3]);
      expect(result).toStrictEqual({
        value: '[1,2.2,3]',
        type: 'string',
      });
    });

    it('stringifies an array of allowed but incoherent types to a string attribute value', () => {
      const result = attributeValueToTypedAttributeValue([1, 'foo', true]);
      expect(result).toStrictEqual({
        value: '[1,"foo",true]',
        type: 'string',
      });
    });

    it('stringifies an array of disallowed and incoherent types to a string attribute value', () => {
      const result = attributeValueToTypedAttributeValue([null, undefined, NaN]);
      expect(result).toStrictEqual({
        value: '[null,null,null]',
        type: 'string',
      });
    });

    it('stringifies an object value to a string attribute value', () => {
      const result = attributeValueToTypedAttributeValue({ foo: 'bar' });
      expect(result).toStrictEqual({
        value: '{"foo":"bar"}',
        type: 'string',
      });
    });

    it('stringifies a null value to a string attribute value', () => {
      const result = attributeValueToTypedAttributeValue(null);
      expect(result).toStrictEqual({
        value: 'null',
        type: 'string',
      });
    });

    it('stringifies an undefined value to a string attribute value', () => {
      const result = attributeValueToTypedAttributeValue(undefined);
      expect(result).toStrictEqual({
        value: 'undefined',
        type: 'string',
      });
    });

    it('stringifies an NaN number value to a string attribute value', () => {
      const result = attributeValueToTypedAttributeValue(NaN);
      expect(result).toStrictEqual({
        value: 'null',
        type: 'string',
      });
    });

    it('converts an object toString if stringification fails', () => {
      const result = attributeValueToTypedAttributeValue({
        value: {
          toJson: () => {
            throw new Error('test');
          },
        },
      });
      expect(result).toStrictEqual({
        value: '{}',
        type: 'string',
      });
    });

    it('falls back to an empty string if stringification and toString fails', () => {
      const result = attributeValueToTypedAttributeValue({
        value: {
          toJSON: () => {
            throw new Error('test');
          },
          toString: () => {
            throw new Error('test');
          },
        },
      });
      expect(result).toStrictEqual({
        value: '',
        type: 'string',
      });
    });

    it('converts a function toString ', () => {
      const result = attributeValueToTypedAttributeValue(() => {
        return 'test';
      });

      expect(result).toStrictEqual({
        value: '() => {\n        return "test";\n      }',
        type: 'string',
      });
    });

    it('converts a symbol toString', () => {
      const result = attributeValueToTypedAttributeValue(Symbol('test'));
      expect(result).toStrictEqual({
        value: 'Symbol(test)',
        type: 'string',
      });
    });
  });

  it.each([1, true, null, undefined, NaN, Symbol('test'), { foo: 'bar' }])(
    'ignores invalid (non-string) units (%s)',
    unit => {
      const result = attributeValueToTypedAttributeValue({ value: 'foo', unit });
      expect(result).toStrictEqual({
        value: 'foo',
        type: 'string',
      });
    },
  );
});

describe('isAttributeObject', () => {
  it.each([
    { value: 123.45, unit: 'ms' },
    { value: [true, false], unit: 'count' },
    { value: { foo: 'bar' }, unit: 'bytes' },
    { value: { value: 123.45, unit: 'ms' }, unit: 'ms' },
    { value: 1 },
  ])('returns true for a valid attribute object (%s)', obj => {
    const result = isAttributeObject(obj);
    expect(result).toBe(true);
  });

  it('returns true for an object with a value property', () => {
    // Explicitly demonstrate this behaviour which for now we're fine with.
    // We may reconsider in the future.
    expect(isAttributeObject({ value: 123.45, some: 'other property' })).toBe(true);
  });

  it.each([1, true, 'test', null, undefined, NaN, Symbol('test')])(
    'returns false for an invalid attribute object (%s)',
    obj => {
      const result = isAttributeObject(obj);
      expect(result).toBe(false);
    },
  );
});
