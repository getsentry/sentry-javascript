import { Baggage } from '@sentry/types';

import {
  createBaggage,
  freezeBaggage,
  getBaggageValue,
  isBaggageEmpty,
  isBaggageFrozen,
  isSentryBaggageEmpty,
  mergeAndSerializeBaggage,
  parseAndFreezeBaggageIfNecessary,
  parseBaggageString,
  serializeBaggage,
  setBaggageValue,
} from '../src/baggage';

describe('Baggage', () => {
  describe('createBaggage', () => {
    it.each([
      ['creates an empty baggage instance', {}, [{}, '', false]],
      [
        'creates a baggage instance with initial values',
        { environment: 'production', anyKey: 'anyValue' },
        [{ environment: 'production', anyKey: 'anyValue' }, '', false],
      ],
    ])('%s', (_: string, input, output) => {
      expect(createBaggage(input)).toEqual(output);
    });

    it('creates a baggage instance and marks it immutable if explicitly specified', () => {
      expect(createBaggage({ environment: 'production', anyKey: 'anyValue' }, '', true)).toEqual([
        { environment: 'production', anyKey: 'anyValue' },
        '',
        true,
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
        createBaggage({ environment: 'development' }, '', true),
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
      ['returns true if the entire baggage tuple is empty', createBaggage({}), true],
      ['returns false if the Sentry part of baggage is not empty', createBaggage({ release: '10.0.2' }), false],
      ['returns false if the 3rd party part of baggage is not empty', createBaggage({}, 'foo=bar'), false],
      ['returns false if both parts of baggage are not empty', createBaggage({ release: '10.0.2' }, 'foo=bar'), false],
    ])('%s', (_: string, baggage, outcome) => {
      expect(isBaggageEmpty(baggage)).toEqual(outcome);
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

  describe('parseAndFreezeBaggageIfNecessary', () => {
    it.each([
      [
        'returns an empty, mutable baggage object if both params are undefined',
        undefined,
        undefined,
        [{}, '', false] as Baggage,
      ],
      [
        'returns an empty, immutable baggage object if sentry-trace header data is defined',
        undefined,
        {},
        [{}, '', true] as Baggage,
      ],
      [
        'returns an empty, immutable baggage object if sentry-trace header data is a string',
        undefined,
        '123',
        [{}, '', true] as Baggage,
      ],
      [
        'returns a non-empty, mutable baggage object if sentry-trace is not defined and only 3rd party baggage items are passed',
        'foo=bar',
        undefined,
        [{}, 'foo=bar', false] as Baggage,
      ],
      [
        'returns a non-empty, immutable baggage object if sentry-trace is not defined and Sentry baggage items are passed',
        'sentry-environment=production,foo=bar',
        undefined,
        [{ environment: 'production' }, 'foo=bar', true] as Baggage,
      ],
      [
        'returns a non-empty, immutable baggage object if sentry-trace is defined',
        'foo=bar',
        {},
        [{}, 'foo=bar', true] as Baggage,
      ],
    ])(
      '%s',
      (_: string, baggageString: string | undefined, sentryTraceData: any | string | undefined, result: Baggage) => {
        expect(parseAndFreezeBaggageIfNecessary(baggageString, sentryTraceData)).toEqual(result);
      },
    );
  });

  describe('isBaggageFrozen', () => {
    it.each([
      ['returns true if the baggage was set immutable', true],
      ['returns false if the baggage was set mutable', false],
    ])('%s', (_: string, outcome) => {
      const baggage: Baggage = [{}, '', outcome];
      expect(isBaggageFrozen(baggage)).toEqual(outcome);
    });
  });

  describe('freezeBaggage', () => {
    it.each([
      ['sets baggage immutable', [{}, '', false] as Baggage],
      ['does not do anything when baggage is already immutable', [{}, '', true] as Baggage],
    ])('%s', (_: string, baggage: Baggage) => {
      freezeBaggage(baggage);
      expect(baggage[2]).toEqual(true);
    });
  });
});
