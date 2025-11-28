import { afterEach, describe, expect, test, vi } from 'vitest';
import { eventContextExtractor, getAwsTraceData } from '../src/utils';

const mockExtractContext = vi.fn();
vi.mock('@opentelemetry/api', async () => {
  const actualApi = await vi.importActual('@opentelemetry/api');
  return {
    ...actualApi,
    propagation: {
      extract: (...args: unknown[]) => mockExtractContext(args),
    },
  };
});

const mockContext = {
  clientContext: {
    Custom: {
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
      clientContext: { Custom: { 'sentry-trace': undefined, baggage: '' } },
    });

    expect(traceData['sentry-trace']).toEqual('12345678901234567890123456789012-1234567890123456-2');
    expect(traceData.baggage).toEqual('sentry-environment=staging');
  });
});

describe('eventContextExtractor', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('passes sentry trace data to the propagation extractor', () => {
    // @ts-expect-error, a partial context object is fine here
    eventContextExtractor(mockEvent, mockContext);

    // @ts-expect-error, a partial context object is fine here
    const expectedTraceData = getAwsTraceData(mockEvent, mockContext);

    expect(mockExtractContext).toHaveBeenCalledTimes(1);
    expect(mockExtractContext).toHaveBeenCalledWith(expect.arrayContaining([expectedTraceData]));
  });

  test('passes along non-sentry trace headers along', () => {
    eventContextExtractor(
      {
        ...mockEvent,
        headers: {
          ...mockEvent.headers,
          'X-Custom-Header': 'Foo',
        },
      },
      // @ts-expect-error, a partial context object is fine here
      mockContext,
    );

    const expectedHeaders = {
      'X-Custom-Header': 'Foo',
      // @ts-expect-error, a partial context object is fine here
      ...getAwsTraceData(mockEvent, mockContext),
    };

    expect(mockExtractContext).toHaveBeenCalledTimes(1);
    expect(mockExtractContext).toHaveBeenCalledWith(expect.arrayContaining([expectedHeaders]));
  });
});
