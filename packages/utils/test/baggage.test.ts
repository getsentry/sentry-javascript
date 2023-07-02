import { baggageHeaderToDynamicSamplingContext, dynamicSamplingContextToSentryBaggageHeader } from '../src/baggage';

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
])('baggageHeaderToDynamicSamplingContext(%p) should return %p', (input, expectedOutput) => {
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
])('dynamicSamplingContextToSentryBaggageHeader(%p) should return %p', (input, expectedOutput) => {
  expect(dynamicSamplingContextToSentryBaggageHeader(input)).toStrictEqual(expectedOutput);
});
