import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTraceServerTimingHeader } from '../../../src/utils/serverTiming';
import * as TraceDataModule from '../../../src/utils/traceData';

describe('getTraceServerTimingHeader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders sentry-trace and baggage as Server-Timing entries', () => {
    vi.spyOn(TraceDataModule, 'getTraceData').mockReturnValueOnce({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    expect(getTraceServerTimingHeader()).toBe(
      'sentry-trace;desc="12345678901234567890123456789012-1234567890123456-1", baggage;desc="sentry-environment=production"',
    );
  });

  it('renders just the sentry-trace entry', () => {
    vi.spyOn(TraceDataModule, 'getTraceData').mockReturnValueOnce({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
    });

    expect(getTraceServerTimingHeader()).toBe(
      'sentry-trace;desc="12345678901234567890123456789012-1234567890123456-1"',
    );
  });

  it('returns an empty string without trace data', () => {
    vi.spyOn(TraceDataModule, 'getTraceData').mockReturnValueOnce({});

    expect(getTraceServerTimingHeader()).toBe('');
  });

  it('uses provided traceData instead of calling getTraceData()', () => {
    const getTraceDataSpy = vi.spyOn(TraceDataModule, 'getTraceData');

    expect(
      getTraceServerTimingHeader({
        'sentry-trace': 'ab12345678901234567890123456789012-1234567890123456-1',
        baggage: 'sentry-environment=staging',
      }),
    ).toBe(
      'sentry-trace;desc="ab12345678901234567890123456789012-1234567890123456-1", baggage;desc="sentry-environment=staging"',
    );
    expect(getTraceDataSpy).not.toHaveBeenCalled();
  });
});
