import { describe, expect, it } from 'vitest';
import { attributeValueToTypedAttributeValue, isAttributeObject } from '../../src/attributes';

describe('attributeValueToTypedAttributeValue', () => {
  describe('without fallback (default behavior)', () => {
    describe('valid primitive values', () => {
      it('converts a string value to a typed attribute value', () => {
        const result = attributeValueToTypedAttributeValue('test');
        expect(result).toStrictEqual({
          value: 'test',
          type: 'string',
        });
      });

      it.each([42, 42.0])('converts an integer number value to a typed attribute value (%s)', value => {
        const result = attributeValueToTypedAttributeValue(value);
        expect(result).toStrictEqual({
          value: value,
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

    describe('valid attribute objects', () => {
      it('converts a primitive value without unit to a typed attribute value', () => {
        const result = attributeValueToTypedAttributeValue({ value: 123.45 });
        expect(result).toStrictEqual({
          value: 123.45,
          type: 'double',
        });
      });

      it('converts a primitive value with unit to a typed attribute value', () => {
        const result = attributeValueToTypedAttributeValue({ value: 123.45, unit: 'ms' });
        expect(result).toStrictEqual({
          value: 123.45,
          type: 'double',
          unit: 'ms',
        });
      });

      it('extracts the value property and ignores other properties', () => {
        const result = attributeValueToTypedAttributeValue({ value: 'foo', unit: 'ms', bar: 'baz' });
        expect(result).toStrictEqual({
          value: 'foo',
          unit: 'ms',
          type: 'string',
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

    describe('invalid values (non-primitives)', () => {
      it.each([
        ['foo', 'bar'],
        [1, 2, 3],
        [true, false, true],
        [1, 'foo', true],
        { foo: 'bar' },
        () => 'test',
        Symbol('test'),
      ])('returns undefined for non-primitive raw values (%s)', value => {
        const result = attributeValueToTypedAttributeValue(value);
        expect(result).toBeUndefined();
      });

      it.each([
        ['foo', 'bar'],
        [1, 2, 3],
        [true, false, true],
        [1, 'foo', true],
        { foo: 'bar' },
        () => 'test',
        Symbol('test'),
      ])('returns undefined for non-primitive attribute object values (%s)', value => {
        const result = attributeValueToTypedAttributeValue({ value });
        expect(result).toBeUndefined();
      });
    });
  });

  describe('with fallback=true', () => {
    describe('valid primitive values', () => {
      it('converts a string value to a typed attribute value', () => {
        const result = attributeValueToTypedAttributeValue('test', true);
        expect(result).toStrictEqual({
          value: 'test',
          type: 'string',
        });
      });

      it('converts an integer number value to a typed attribute value', () => {
        const result = attributeValueToTypedAttributeValue(42, true);
        expect(result).toStrictEqual({
          value: 42,
          type: 'integer',
        });
      });

      it('converts a double number value to a typed attribute value', () => {
        const result = attributeValueToTypedAttributeValue(42.34, true);
        expect(result).toStrictEqual({
          value: 42.34,
          type: 'double',
        });
      });

      it('converts a boolean value to a typed attribute value', () => {
        const result = attributeValueToTypedAttributeValue(true, true);
        expect(result).toStrictEqual({
          value: true,
          type: 'boolean',
        });
      });
    });

    describe('valid attribute objects', () => {
      it('converts a primitive value without unit to a typed attribute value', () => {
        const result = attributeValueToTypedAttributeValue({ value: 123.45 }, true);
        expect(result).toStrictEqual({
          value: 123.45,
          type: 'double',
        });
      });

      it('converts a primitive value with unit to a typed attribute value', () => {
        const result = attributeValueToTypedAttributeValue({ value: 123.45, unit: 'ms' }, true);
        expect(result).toStrictEqual({
          value: 123.45,
          type: 'double',
          unit: 'ms',
        });
      });

      it('extracts the value property and ignores other properties', () => {
        const result = attributeValueToTypedAttributeValue({ value: 'foo', unit: 'ms', bar: 'baz' }, true);
        expect(result).toStrictEqual({
          value: 'foo',
          unit: 'ms',
          type: 'string',
        });
      });

      it.each([1, true, null, undefined, NaN, { foo: 'bar' }])(
        'ignores invalid (non-string) units and preserves unit on fallback (%s)',
        unit => {
          const result = attributeValueToTypedAttributeValue({ value: 'foo', unit }, true);
          expect(result).toStrictEqual({
            value: 'foo',
            type: 'string',
          });
        },
      );

      it('preserves valid unit when falling back on invalid value', () => {
        const result = attributeValueToTypedAttributeValue({ value: { nested: 'object' }, unit: 'ms' }, true);
        expect(result).toStrictEqual({
          value: '{"nested":"object"}',
          type: 'string',
          unit: 'ms',
        });
      });
    });

    describe('invalid values (non-primitives) - stringified fallback', () => {
      it('stringifies string arrays', () => {
        const result = attributeValueToTypedAttributeValue(['foo', 'bar'], true);
        expect(result).toStrictEqual({
          value: '["foo","bar"]',
          type: 'string',
        });
      });

      it('stringifies number arrays', () => {
        const result = attributeValueToTypedAttributeValue([1, 2, 3], true);
        expect(result).toStrictEqual({
          value: '[1,2,3]',
          type: 'string',
        });
      });

      it('stringifies boolean arrays', () => {
        const result = attributeValueToTypedAttributeValue([true, false, true], true);
        expect(result).toStrictEqual({
          value: '[true,false,true]',
          type: 'string',
        });
      });

      it('stringifies mixed arrays', () => {
        const result = attributeValueToTypedAttributeValue([1, 'foo', true], true);
        expect(result).toStrictEqual({
          value: '[1,"foo",true]',
          type: 'string',
        });
      });

      it('stringifies objects', () => {
        const result = attributeValueToTypedAttributeValue({ foo: 'bar' }, true);
        expect(result).toStrictEqual({
          value: '{"foo":"bar"}',
          type: 'string',
        });
      });

      it('returns empty string for non-stringifiable values (functions)', () => {
        const result = attributeValueToTypedAttributeValue(() => 'test', true);
        expect(result).toStrictEqual({
          value: '',
          type: 'string',
        });
      });

      it('returns empty string for non-stringifiable values (symbols)', () => {
        const result = attributeValueToTypedAttributeValue(Symbol('test'), true);
        expect(result).toStrictEqual({
          value: '',
          type: 'string',
        });
      });

      it('stringifies non-primitive attribute object values', () => {
        const result = attributeValueToTypedAttributeValue({ value: { nested: 'object' } }, true);
        expect(result).toStrictEqual({
          value: '{"nested":"object"}',
          type: 'string',
        });
      });
    });
  });
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
