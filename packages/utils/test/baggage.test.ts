import { createBaggage, getBaggageValue } from '../src/baggage';

describe('Baggage', () => {
  describe('createBaggage', () => {
    it.each([
      ['creates an empty baggage instance', {}, {}],
      [
        'creates a baggage instance with initial values',
        { environment: 'production', anyKey: 'anyValue' },
        { environment: 'production', anyKey: 'anyValue' },
      ],
    ])('%s', (_: string, input, output) => {
      expect(createBaggage(input)).toEqual(output);
    });
  });

  describe('getBaggageValue', () => {
    it.each([
      ['gets a baggage item', { environment: 'production', anyKey: 'anyValue' }, 'environment', 'production'],
      ['finds undefined items', {}, 'environment', undefined],
    ])('%s', (_: string, baggage, key, value) => {
      expect(getBaggageValue(baggage, key)).toEqual(value);
    });
  });
});
