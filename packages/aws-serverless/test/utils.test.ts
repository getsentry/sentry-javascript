import { describe, expect, test } from 'vitest';
import { getAwsTraceData } from '../src/utils';

const mockContext = {
  clientContext: {
    custom: {
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    },
  },
};
const mockEvent = {
  headers: {
    'sentry-trace': '12345678901234567890123456789012-1234567890123456-2',
    baggage: 'sentry-environment=staging',
  },
};

describe('getTraceData', () => {
  test('gets sentry trace data from the context', () => {
    // @ts-expect-error, a partial context object is fine here
    const traceData = getAwsTraceData({}, mockContext);

    expect(traceData['sentry-trace']).toEqual('12345678901234567890123456789012-1234567890123456-1');
    expect(traceData.baggage).toEqual('sentry-environment=production');
  });

  test('gets sentry trace data from the context even if event has data', () => {
    // @ts-expect-error, a partial context object is fine here
    const traceData = getAwsTraceData(mockEvent, mockContext);

    expect(traceData['sentry-trace']).toEqual('12345678901234567890123456789012-1234567890123456-1');
    expect(traceData.baggage).toEqual('sentry-environment=production');
  });

  test('gets sentry trace data from the event if no context is passed', () => {
    const traceData = getAwsTraceData(mockEvent);

    expect(traceData['sentry-trace']).toEqual('12345678901234567890123456789012-1234567890123456-2');
    expect(traceData.baggage).toEqual('sentry-environment=staging');
  });

  test('gets sentry trace data from the event if the context sentry trace is undefined', () => {
    const traceData = getAwsTraceData(mockEvent, {
      // @ts-expect-error, a partial context object is fine here
      clientContext: { custom: { 'sentry-trace': undefined, baggage: '' } },
    });

    expect(traceData['sentry-trace']).toEqual('12345678901234567890123456789012-1234567890123456-2');
    expect(traceData.baggage).toEqual('sentry-environment=staging');
  });
});
