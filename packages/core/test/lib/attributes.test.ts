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
    it.each([
      ['foo', 'bar'],
      [1, 2, 3],
      [true, false, true],
      [1, 'foo', true],
      { foo: 'bar' },
      () => 'test',
      Symbol('test'),
    ])('returns undefined for none-primitive values (%s)', value => {
      const result = attributeValueToTypedAttributeValue(value);
      expect(result).toBeUndefined();
    });
  });

  describe('attribute objects without units', () => {
    it('converts a primitive value to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue({ value: 123.45 });
      expect(result).toStrictEqual({
        value: 123.45,
        type: 'double',
      });
    });

    it.each([
      ['foo', 'bar'],
      [1, 2, 3],
      [true, false, true],
      [1, 'foo', true],
      { foo: 'bar' },
      () => 'test',
      Symbol('test'),
    ])('returns undefined for none-primitive values (%s)', value => {
      const result = attributeValueToTypedAttributeValue({ value });
      expect(result).toBeUndefined();
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
