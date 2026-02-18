import { TraceFlags } from '@opentelemetry/api';
import * as sentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSpanLinks, getStoredSpanContext, getTraceLinkKey, storeSpanContext } from '../src/utils/traceLinks';

vi.mock('@sentry/core', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    getActiveSpan: vi.fn(),
  };
});

describe('traceLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTraceLinkKey', () => {
    it('returns prefixed key for method name', () => {
      expect(getTraceLinkKey('alarm')).toBe('__SENTRY_TRACE_LINK__alarm');
    });

    it('returns prefixed key for custom method name', () => {
      expect(getTraceLinkKey('myCustomMethod')).toBe('__SENTRY_TRACE_LINK__myCustomMethod');
    });

    it('handles empty method name', () => {
      expect(getTraceLinkKey('')).toBe('__SENTRY_TRACE_LINK__');
    });
  });

  describe('storeSpanContext', () => {
    it('stores span context with sampled=true when traceFlags is SAMPLED', async () => {
      const mockSpanContext = {
        traceId: 'abc123def456789012345678901234ab',
        spanId: '1234567890abcdef',
        traceFlags: TraceFlags.SAMPLED,
      };
      const mockSpan = {
        spanContext: vi.fn().mockReturnValue(mockSpanContext),
      };
      vi.mocked(sentryCore.getActiveSpan).mockReturnValue(mockSpan as any);

      const mockStorage = createMockStorage();
      await storeSpanContext(mockStorage, 'alarm');

      expect(mockStorage.put).toHaveBeenCalledWith('__SENTRY_TRACE_LINK__alarm', {
        traceId: 'abc123def456789012345678901234ab',
        spanId: '1234567890abcdef',
        sampled: true,
      });
    });

    it('stores span context with sampled=false when traceFlags is NONE', async () => {
      const mockSpanContext = {
        traceId: 'abc123def456789012345678901234ab',
        spanId: '1234567890abcdef',
        traceFlags: TraceFlags.NONE,
      };
      const mockSpan = {
        spanContext: vi.fn().mockReturnValue(mockSpanContext),
      };
      vi.mocked(sentryCore.getActiveSpan).mockReturnValue(mockSpan as any);

      const mockStorage = createMockStorage();
      await storeSpanContext(mockStorage, 'alarm');

      expect(mockStorage.put).toHaveBeenCalledWith('__SENTRY_TRACE_LINK__alarm', {
        traceId: 'abc123def456789012345678901234ab',
        spanId: '1234567890abcdef',
        sampled: false,
      });
    });

    it('does not store when no active span', async () => {
      vi.mocked(sentryCore.getActiveSpan).mockReturnValue(undefined);

      const mockStorage = createMockStorage();
      await storeSpanContext(mockStorage, 'alarm');

      expect(mockStorage.put).not.toHaveBeenCalled();
    });
  });

  describe('getStoredSpanContext', () => {
    it('retrieves stored span context', async () => {
      const storedContext = {
        traceId: 'abc123def456789012345678901234ab',
        spanId: '1234567890abcdef',
        sampled: true,
      };
      const mockStorage = createMockStorage();
      mockStorage.get = vi.fn().mockResolvedValue(storedContext);

      const result = await getStoredSpanContext(mockStorage, 'alarm');

      expect(mockStorage.get).toHaveBeenCalledWith('__SENTRY_TRACE_LINK__alarm');
      expect(result).toEqual(storedContext);
    });

    it('returns undefined when no stored context', async () => {
      const mockStorage = createMockStorage();
      mockStorage.get = vi.fn().mockResolvedValue(undefined);

      const result = await getStoredSpanContext(mockStorage, 'alarm');

      expect(result).toBeUndefined();
    });

    it('returns undefined when storage throws', async () => {
      const mockStorage = createMockStorage();
      mockStorage.get = vi.fn().mockRejectedValue(new Error('Storage error'));

      const result = await getStoredSpanContext(mockStorage, 'alarm');

      expect(result).toBeUndefined();
    });
  });

  describe('buildSpanLinks', () => {
    it('builds span links with SAMPLED traceFlags when sampled is true', () => {
      const storedContext = {
        traceId: 'abc123def456789012345678901234ab',
        spanId: '1234567890abcdef',
        sampled: true,
      };

      const links = buildSpanLinks(storedContext);

      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        context: {
          traceId: 'abc123def456789012345678901234ab',
          spanId: '1234567890abcdef',
          traceFlags: TraceFlags.SAMPLED,
        },
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
      });
    });

    it('builds span links with NONE traceFlags when sampled is false', () => {
      const storedContext = {
        traceId: 'abc123def456789012345678901234ab',
        spanId: '1234567890abcdef',
        sampled: false,
      };

      const links = buildSpanLinks(storedContext);

      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        context: {
          traceId: 'abc123def456789012345678901234ab',
          spanId: '1234567890abcdef',
          traceFlags: TraceFlags.NONE,
        },
        attributes: {
          'sentry.link.type': 'previous_trace',
        },
      });
    });
  });
});

function createMockStorage(): any {
  return {
    get: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(false),
    list: vi.fn().mockResolvedValue(new Map()),
    getAlarm: vi.fn().mockResolvedValue(null),
    setAlarm: vi.fn().mockResolvedValue(undefined),
    deleteAlarm: vi.fn().mockResolvedValue(undefined),
    deleteAll: vi.fn().mockResolvedValue(undefined),
    sync: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn().mockImplementation(async (cb: () => unknown) => cb()),
    sql: {
      exec: vi.fn(),
    },
  };
}
