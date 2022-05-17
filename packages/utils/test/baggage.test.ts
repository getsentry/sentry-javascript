import { createBaggage, getBaggageValue, parseBaggageString, serializeBaggage, setBaggageValue } from '../src/baggage';

describe('Baggage', () => {
  describe('createBaggage', () => {
    it.each([
      ['creates an empty baggage instance', {}, [{}, '']],
      [
        'creates a baggage instance with initial values',
        { environment: 'production', anyKey: 'anyValue' },
        [{ environment: 'production', anyKey: 'anyValue' }, ''],
      ],
    ])('%s', (_: string, input, output) => {
      expect(createBaggage(input)).toEqual(output);
    });
  });

  describe('getBaggageValue', () => {
    it.each([
      [
        'gets a baggage item',
        createBaggage({ environment: 'production', anyKey: 'anyValue' }),
        'environment',
        'production',
      ],
      ['finds undefined items', createBaggage({}), 'environment', undefined],
    ])('%s', (_: string, baggage, key, value) => {
      expect(getBaggageValue(baggage, key)).toEqual(value);
    });
  });

  describe('setBaggageValue', () => {
    it.each([
      ['sets a baggage item', createBaggage({}), 'environment', 'production'],
      ['overwrites a baggage item', createBaggage({ environment: 'development' }), 'environment', 'production'],
    ])('%s', (_: string, baggage, key, value) => {
      setBaggageValue(baggage, key, value);
      expect(getBaggageValue(baggage, key)).toEqual(value);
    });
  });

  describe('serializeBaggage', () => {
    it.each([
      ['serializes empty baggage', createBaggage({}), ''],
      [
        'serializes baggage with a single value',
        createBaggage({ environment: 'production' }),
        'sentry-environment=production',
      ],
      [
        'serializes baggage with multiple values',
        createBaggage({ environment: 'production', release: '10.0.2' }),
        'sentry-environment=production,sentry-release=10.0.2',
      ],
      [
        'keeps non-sentry prefixed baggage items',
        createBaggage(
          { environment: 'production', release: '10.0.2' },
          'userId=alice,serverNode=DF%2028,isProduction=false',
        ),
        'userId=alice,serverNode=DF%2028,isProduction=false,sentry-environment=production,sentry-release=10.0.2',
      ],
      [
        'can only use non-sentry prefixed baggage items',
        createBaggage({}, 'userId=alice,serverNode=DF%2028,isProduction=false'),
        'userId=alice,serverNode=DF%2028,isProduction=false',
      ],
    ])('%s', (_: string, baggage, serializedBaggage) => {
      expect(serializeBaggage(baggage)).toEqual(serializedBaggage);
    });
  });

  describe('parseBaggageString', () => {
    it.each([
      ['parses an empty string', '', createBaggage({})],
      [
        'parses sentry values into baggage',
        'sentry-environment=production,sentry-release=10.0.2',
        createBaggage({ environment: 'production', release: '10.0.2' }),
      ],
      [
        'parses arbitrary baggage headers',
        'userId=alice,serverNode=DF%2028,isProduction=false,sentry-environment=production,sentry-release=10.0.2',
        createBaggage(
          { environment: 'production', release: '10.0.2' },
          'userId=alice,serverNode=DF%2028,isProduction=false',
        ),
      ],
    ])('%s', (_: string, baggageString, baggage) => {
      expect(parseBaggageString(baggageString)).toEqual(baggage);
    });
  });
});
