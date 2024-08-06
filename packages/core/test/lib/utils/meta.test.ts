import { getTraceMetaTags } from '../../../src/utils/meta';
import * as TraceDataModule from '../../../src/utils/traceData';

describe('getTraceMetaTags', () => {
  it('renders baggage and sentry-trace values to stringified Html meta tags', () => {
    jest.spyOn(TraceDataModule, 'getTraceData').mockReturnValueOnce({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    expect(getTraceMetaTags()).toBe(`<meta name="sentry-trace" content="12345678901234567890123456789012-1234567890123456-1"/>
<meta name="baggage" content="sentry-environment=production"/>`);
  });

  it('renders just sentry-trace values to stringified Html meta tags', () => {
    jest.spyOn(TraceDataModule, 'getTraceData').mockReturnValueOnce({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
    });

    expect(getTraceMetaTags()).toBe(
      '<meta name="sentry-trace" content="12345678901234567890123456789012-1234567890123456-1"/>',
    );
  });

  it('returns an empty string if neither sentry-trace nor baggage values are available', () => {
    jest.spyOn(TraceDataModule, 'getTraceData').mockReturnValueOnce({});

    expect(getTraceMetaTags()).toBe('');
  });
});
