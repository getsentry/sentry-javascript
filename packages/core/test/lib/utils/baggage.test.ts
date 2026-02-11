import { describe, expect, test } from 'vitest';
import {
  baggageHeaderToDynamicSamplingContext,
  dynamicSamplingContextToSentryBaggageHeader,
  parseBaggageHeader,
} from '../../../src/utils/baggage';

test.each([
  ['', undefined],
  ['     ', undefined],
  ['sentry-environment=production,sentry-release=10.0.2', { environment: 'production', release: '10.0.2' }],
  [
    'userId=alice,serverNode=DF%2028,isProduction=false,sentry-environment=production,sentry-release=10.0.2',
    { environment: 'production', release: '10.0.2' },
  ],
  ['userId=alice,serverNode=DF%2028,isProduction=false', undefined],
  [
    'userId=alice,    serverNode=DF%2028   , isProduction=false,   ,,sentry-environment=production,,sentry-release=10.0.2',
    { environment: 'production', release: '10.0.2' },
  ],
  [['userId=alice', 'sentry-environment=production', 'foo=bar'], { environment: 'production' }],
  [
    ['userId=alice,   userName=bob', 'sentry-environment=production,sentry-release=1.0.1', 'foo=bar'],
    { environment: 'production', release: '1.0.1' },
  ],
  [
    ['', 'sentry-environment=production,sentry-release=1.0.1', '    ', 'foo=bar'],
    { environment: 'production', release: '1.0.1' },
  ],
  [42, undefined],
])('baggageHeaderToDynamicSamplingContext(%j) should return %j', (input, expectedOutput) => {
  expect(baggageHeaderToDynamicSamplingContext(input)).toStrictEqual(expectedOutput);
});

test.each([
  [undefined, undefined],
  [{}, undefined],
  [{ release: 'abcdf' }, 'sentry-release=abcdf'],
  [{ release: 'abcdf', environment: '1234' }, 'sentry-release=abcdf,sentry-environment=1234'],
  [
    { release: 'abcdf', environment: '1234', someRandomKey: 'foo' },
    'sentry-release=abcdf,sentry-environment=1234,sentry-someRandomKey=foo',
  ],
])('dynamicSamplingContextToSentryBaggageHeader(%j) should return %j', (input, expectedOutput) => {
  expect(dynamicSamplingContextToSentryBaggageHeader(input)).toStrictEqual(expectedOutput);
});

describe('parseBaggageHeader', () => {
  test.each([
    [undefined, undefined],
    [1, undefined],
    [true, undefined],
    [false, undefined],
    [null, undefined],
    [NaN, undefined],
    [Infinity, undefined],
    [0, undefined],
    ['', undefined],
    ['foo', {}],
    [
      'sentry-environment=production,sentry-release=10.0.2,foo=bar',
      { 'sentry-environment': 'production', 'sentry-release': '10.0.2', foo: 'bar' },
    ],
    [
      ['sentry-environment=production,sentry-release=10.0.2,foo=bar', 'foo2=bar2'],
      { 'sentry-environment': 'production', 'sentry-release': '10.0.2', foo: 'bar', foo2: 'bar2' },
    ],
    // ignores malformed baggage entries
    ['foo=bar,foo2=%3G', { foo: 'bar' }],
  ])('parseBaggageHeader(%j) should return %j', (input, expectedOutput) => {
    const actual = parseBaggageHeader(input);
    expect(actual).toStrictEqual(expectedOutput);
  });

  test('should preserve property values with equal signs', () => {
    // see https://www.w3.org/TR/baggage/#example
    const baggageHeader = 'key1=value1;property1;property2, key2 = value2, key3=value3; propertyKey=propertyValue';
    const result = parseBaggageHeader(baggageHeader);

    expect(result).toStrictEqual({
      key1: 'value1;property1;property2',
      key2: 'value2',
      key3: 'value3; propertyKey=propertyValue',
    });
  });
});
