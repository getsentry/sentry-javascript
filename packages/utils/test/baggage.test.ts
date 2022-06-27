import { Baggage } from '@sentry/types';

import {
  createBaggage,
  getBaggageValue,
  isBaggageMutable,
  isSentryBaggageEmpty,
  mergeAndSerializeBaggage,
  parseBaggageHeader,
  parseBaggageSetMutability,
  serializeBaggage,
  setBaggageImmutable,
  setBaggageValue,
} from '../src/baggage';

describe('Baggage', () => {
  describe('createBaggage', () => {
    it.each([
      ['creates an empty baggage instance', {}, [{}, '', true]],
      [
        'creates a baggage instance with initial values',
        { environment: 'production', anyKey: 'anyValue' },
        [{ environment: 'production', anyKey: 'anyValue' }, '', true],
      ],
    ])('%s', (_: string, input, output) => {
      expect(createBaggage(input)).toEqual(output);
    });

    it('creates a baggage instance and marks it immutable if explicitly specified', () => {
      expect(createBaggage({ environment: 'production', anyKey: 'anyValue' }, '', false)).toEqual([
        { environment: 'production', anyKey: 'anyValue' },
        '',
        false,
      ]);
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
      [
        'does not set a value if the passed baggage item is immutable',
        createBaggage({ environment: 'development' }, '', false),
        'environment',
        'development',
      ],
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

  describe('parseBaggageHeader', () => {
    it.each([
      ['parses an empty string', '', undefined, createBaggage({})],
      ['parses a blank string', '     ', undefined, createBaggage({})],
      [
        'parses sentry values into baggage',
        'sentry-environment=production,sentry-release=10.0.2',
        undefined,
        createBaggage({ environment: 'production', release: '10.0.2' }),
      ],
      [
        'ignores 3rd party entries by default',
        'userId=alice,serverNode=DF%2028,isProduction=false,sentry-environment=production,sentry-release=10.0.2',
        undefined,
        createBaggage({ environment: 'production', release: '10.0.2' }, ''),
      ],
      [
        'parses sentry- and arbitrary 3rd party values if the 3rd party entries flag is set to true',
        'userId=alice,serverNode=DF%2028,isProduction=false,sentry-environment=production,sentry-release=10.0.2',
        true,
        createBaggage(
          { environment: 'production', release: '10.0.2' },
          'userId=alice,serverNode=DF%2028,isProduction=false',
        ),
      ],
      [
        'parses arbitrary baggage entries from string with empty and blank entries',
        'userId=alice,    serverNode=DF%2028   , isProduction=false,   ,,sentry-environment=production,,sentry-release=10.0.2',
        true,
        createBaggage(
          { environment: 'production', release: '10.0.2' },
          'userId=alice,serverNode=DF%2028,isProduction=false',
        ),
      ],
      [
        'parses a string array',
        ['userId=alice', 'sentry-environment=production', 'foo=bar'],
        true,
        createBaggage({ environment: 'production' }, 'userId=alice,foo=bar'),
      ],
      [
        'parses a string array with items containing multiple entries',
        ['userId=alice,   userName=bob', 'sentry-environment=production,sentry-release=1.0.1', 'foo=bar'],
        true,
        createBaggage({ environment: 'production', release: '1.0.1' }, 'userId=alice,userName=bob,foo=bar'),
      ],
      [
        'parses a string array with empty/blank entries',
        ['', 'sentry-environment=production,sentry-release=1.0.1', '    ', 'foo=bar'],
        true,
        createBaggage({ environment: 'production', release: '1.0.1' }, 'foo=bar'),
      ],
      ['ignorese other input types than string and string[]', 42, undefined, createBaggage({}, '')],
    ])('%s', (_: string, baggageValue, includeThirPartyEntries, expectedBaggage) => {
      expect(parseBaggageHeader(baggageValue, includeThirPartyEntries)).toEqual(expectedBaggage);
    });
  });

  describe('isSentryBaggageEmpty', () => {
    it.each([
      ['returns true if the Sentry part of baggage is empty', createBaggage({}), true],
      ['returns false if the Sentry part of baggage is not empty', createBaggage({ release: '10.0.2' }), false],
    ])('%s', (_: string, baggage, outcome) => {
      expect(isSentryBaggageEmpty(baggage)).toEqual(outcome);
    });
  });

  describe('mergeAndSerializeBaggage', () => {
    it.each([
      [
        'returns original baggage when there is no additional baggage header',
        createBaggage({ release: '1.1.1', user_id: '1234' }),
        undefined,
        'sentry-release=1.1.1,sentry-user_id=1234',
      ],
      [
        'returns merged baggage when there is a 3rd party header added',
        createBaggage({ release: '1.1.1', user_id: '1234' }, 'foo=bar'),
        'bar=baz,key=value',
        'bar=baz,key=value,sentry-release=1.1.1,sentry-user_id=1234',
      ],
      ['returns merged baggage original baggage is empty', createBaggage({}), 'bar=baz,key=value', 'bar=baz,key=value'],
      [
        'ignores sentry- items in 3rd party baggage header',
        createBaggage({}),
        'bar=baz,sentry-user_id=abc,key=value,sentry-sample_rate=0.76',
        'bar=baz,key=value',
      ],
      ['returns empty string when original and 3rd party baggage are empty', createBaggage({}), '', ''],
      ['returns merged baggage original baggage is undefined', undefined, 'bar=baz,key=value', 'bar=baz,key=value'],
      ['returns empty string when both params are undefined', undefined, undefined, ''],
    ])('%s', (_: string, baggage, headerBaggageString, outcome) => {
      expect(mergeAndSerializeBaggage(baggage, headerBaggageString)).toEqual(outcome);
    });
  });

  describe('parseBaggageSetMutability', () => {
    it.each([
      [
        'returns an empty, mutable baggage object if both params are undefined',
        undefined,
        undefined,
        [{}, '', true] as Baggage,
      ],
      [
        'returns an empty, immutable baggage object if sentry-trace header data is defined',
        undefined,
        {},
        [{}, '', false] as Baggage,
      ],
      [
        'returns an empty, immutable baggage object if sentry-trace header data is a string',
        undefined,
        '123',
        [{}, '', false] as Baggage,
      ],
      [
        'returns a non-empty, mutable baggage object if sentry-trace is not defined and ignores 3rd party baggage items',
        'foo=bar',
        undefined,
        [{}, '', true] as Baggage,
      ],
      [
        'returns a non-empty, immutable baggage object if sentry-trace is defined',
        'foo=bar,sentry-environment=production,sentry-sample_rate=0.96',
        {},
        [{ environment: 'production', sample_rate: '0.96' }, '', false] as Baggage,
      ],
    ])(
      '%s',
      (_: string, baggageString: string | undefined, sentryTraceData: any | string | undefined, result: Baggage) => {
        expect(parseBaggageSetMutability(baggageString, sentryTraceData)).toEqual(result);
      },
    );
  });

  describe('isBaggageMutable', () => {
    it.each([
      ['returns false if baggage is set immutable', false],
      ['returns true if baggage is set mutable', true],
    ])('%s', (_: string, outcome) => {
      const baggage: Baggage = [{}, '', outcome];
      expect(isBaggageMutable(baggage)).toEqual(outcome);
    });
  });

  describe('setBaggageImmutable', () => {
    it.each([
      ['sets baggage immutable', [{}, '', true] as Baggage],
      ['does not do anything when baggage is already immutable', [{}, '', false] as Baggage],
    ])('%s', (_: string, baggage: Baggage) => {
      setBaggageImmutable(baggage);
      expect(baggage[2]).toEqual(false);
    });
  });
});
