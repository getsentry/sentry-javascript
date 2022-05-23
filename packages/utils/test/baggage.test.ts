import {
  createBaggage,
  getBaggageValue,
  isBaggageEmpty,
  mergeAndSerializeBaggage,
  parseBaggageString,
  serializeBaggage,
  setBaggageValue,
} from '../src/baggage';

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

  describe('isBaggageEmpty', () => {
    it.each([
      ['returns true if the modifyable part of baggage is empty', createBaggage({}), true],
      ['returns false if the modifyable part of baggage is not empty', createBaggage({ release: '10.0.2' }), false],
    ])('%s', (_: string, baggage, outcome) => {
      expect(isBaggageEmpty(baggage)).toEqual(outcome);
    });
  });

  describe('mergeAndSerializeBaggage', () => {
    it.each([
      [
        'returns original baggage when there is no additional baggage',
        createBaggage({ release: '1.1.1', userid: '1234' }, 'foo=bar'),
        undefined,
        'foo=bar,sentry-release=1.1.1,sentry-userid=1234',
      ],
      [
        'returns merged baggage when there is a 3rd party header added',
        createBaggage({ release: '1.1.1', userid: '1234' }, 'foo=bar'),
        'bar=baz,key=value',
        'bar=baz,key=value,sentry-release=1.1.1,sentry-userid=1234',
      ],
      ['returns merged baggage original baggage is empty', createBaggage({}), 'bar=baz,key=value', 'bar=baz,key=value'],
      ['returns empty string when original and 3rd party baggage are empty', createBaggage({}), '', ''],
      ['returns merged baggage original baggage is undefined', undefined, 'bar=baz,key=value', 'bar=baz,key=value'],
      ['returns empty string when both params are undefined', undefined, undefined, ''],
    ])('%s', (_: string, baggage, headerBaggageString, outcome) => {
      expect(mergeAndSerializeBaggage(baggage, headerBaggageString)).toEqual(outcome);
    });
  });
});
