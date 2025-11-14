import { describe, expect, it } from 'vitest';
import { attributeValueToTypedAttributeValue } from '../../src/attributes';

describe('attributeValueToTypedAttributeValue', () => {
  describe('primitive values', () => {
    it('converts a string value to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue('test');
      expect(result).toEqual({
        value: 'test',
        type: 'string',
      });
    });

    it('converts an interger number value to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue(42);
      expect(result).toEqual({
        value: 42,
        type: 'integer',
      });
    });

    it('converts a double number value to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue(42.34);
      expect(result).toEqual({
        value: 42.34,
        type: 'double',
      });
    });

    it('converts a boolean value to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue(true);
      expect(result).toEqual({
        value: true,
        type: 'boolean',
      });
    });
  });

  describe('arrays', () => {
    it('converts an array of strings to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue(['foo', 'bar']);
      expect(result).toEqual({
        value: ['foo', 'bar'],
        type: 'string[]',
      });
    });

    it('converts an array of integer numbers to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue([1, 2, 3]);
      expect(result).toEqual({
        value: [1, 2, 3],
        type: 'integer[]',
      });
    });

    it('converts an array of double numbers to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue([1.1, 2.2, 3.3]);
      expect(result).toEqual({
        value: [1.1, 2.2, 3.3],
        type: 'double[]',
      });
    });

    it('converts an array of booleans to a typed attribute value', () => {
      const result = attributeValueToTypedAttributeValue([true, false, true]);
      expect(result).toEqual({
        value: [true, false, true],
        type: 'boolean[]',
      });
    });
  });

  describe('disallowed value types', () => {
    it('stringifies mixed float and integer numbers to a string attribute value', () => {
      const result = attributeValueToTypedAttributeValue([1, 2.2, 3]);
      expect(result).toEqual({
        value: '[1,2.2,3]',
        type: 'string',
      });
    });

    it('stringifies an array of mixed types to a string attribute value', () => {
      const result = attributeValueToTypedAttributeValue([1, 'foo', true]);
      expect(result).toEqual({
        value: '[1,"foo",true]',
        type: 'string',
      });
    });

    it('stringifies an object value to a string attribute value', () => {
      const result = attributeValueToTypedAttributeValue({ foo: 'bar' });
      expect(result).toEqual({
        value: '{"foo":"bar"}',
        type: 'string',
      });
    });
  });
});
