import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearNavigationTraceCache,
  getMetaTagTraceContext,
  getNavigationTraceContext,
  getNavigationTraceContextAsync,
  isServerTimingSupported,
} from '../../src/client/serverTimingTracePropagation';

// Mock @sentry/react WINDOW
const mockPerformance = {
  getEntriesByType: vi.fn(),
};

const mockDocument = {
  querySelector: vi.fn(),
};

vi.mock('@sentry/react', () => ({
  WINDOW: {
    get performance() {
      return mockPerformance;
    },
    get document() {
      return mockDocument;
    },
    location: { pathname: '/' },
  },
}));

// Mock @sentry/core
vi.mock('@sentry/core', () => ({
  debug: {
    log: vi.fn(),
    warn: vi.fn(),
  },
  extractTraceparentData: vi.fn((sentryTrace: string) => {
    const parts = sentryTrace.split('-');
    if (parts.length >= 2 && parts[0].length === 32 && parts[1].length === 16) {
      return {
        traceId: parts[0],
        parentSpanId: parts[1],
        sampled: parts[2] === '1' ? true : parts[2] === '0' ? false : undefined,
      };
    }
    return undefined;
  }),
}));

describe('serverTimingTracePropagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearNavigationTraceCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearNavigationTraceCache();
  });

  describe('isServerTimingSupported', () => {
    it('returns false when performance API is not available', () => {
      mockPerformance.getEntriesByType = undefined as unknown as typeof mockPerformance.getEntriesByType;

      expect(isServerTimingSupported()).toBe(false);
    });

    it('returns false when navigation entries are empty', () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([]);

      expect(isServerTimingSupported()).toBe(false);
    });

    it('returns false when navigation entry does not have serverTiming property', () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([{ responseStart: 100 }]);

      expect(isServerTimingSupported()).toBe(false);
    });

    it('returns true when serverTiming property is available', () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [],
        },
      ]);

      expect(isServerTimingSupported()).toBe(true);
    });

    it('handles exceptions gracefully', () => {
      mockPerformance.getEntriesByType = vi.fn().mockImplementation(() => {
        throw new Error('API not supported');
      });

      expect(isServerTimingSupported()).toBe(false);
    });
  });

  describe('getNavigationTraceContext', () => {
    it('returns null when Server-Timing API is not supported', () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([]);

      expect(getNavigationTraceContext()).toBeNull();
    });

    it('returns null when no navigation entries exist', () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [],
        },
      ]);

      expect(getNavigationTraceContext()).toBeNull();
    });

    it('returns null when serverTiming has no sentry-trace entry', () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [{ name: 'other', description: 'value' }],
        },
      ]);

      expect(getNavigationTraceContext()).toBeNull();
    });

    it('returns trace context when valid sentry-trace and baggage are present', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const sentryTrace = `${traceId}-${spanId}-1`;
      const baggage = 'sentry-trace_id=123,sentry-environment=production';

      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [
            { name: 'sentry-trace', description: sentryTrace },
            { name: 'baggage', description: encodeURIComponent(baggage) },
          ],
        },
      ]);

      const result = getNavigationTraceContext();

      expect(result).toEqual({
        sentryTrace,
        baggage,
      });
    });

    it('returns trace context with empty baggage when only sentry-trace is present', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const sentryTrace = `${traceId}-${spanId}-1`;

      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [{ name: 'sentry-trace', description: sentryTrace }],
        },
      ]);

      const result = getNavigationTraceContext();

      expect(result).toEqual({
        sentryTrace,
        baggage: '',
      });
    });

    it('caches the result after first successful retrieval', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const sentryTrace = `${traceId}-${spanId}-1`;

      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [{ name: 'sentry-trace', description: sentryTrace }],
        },
      ]);

      const result1 = getNavigationTraceContext();
      const result2 = getNavigationTraceContext();

      expect(result1).toBe(result2);
      // First call: isServerTimingSupported + tryGetNavigationTraceContext
      // Second call: returns from cache
      expect(mockPerformance.getEntriesByType).toHaveBeenCalledTimes(2);
    });

    it('returns null for pending state (responseStart === 0)', () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 0,
          serverTiming: [{ name: 'sentry-trace', description: 'valid-trace' }],
        },
      ]);

      const result = getNavigationTraceContext();

      expect(result).toBeNull();
    });

    it('returns null and caches for unavailable state', () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [],
        },
      ]);

      const result1 = getNavigationTraceContext();
      const result2 = getNavigationTraceContext();

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('handles invalid sentry-trace format', () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [{ name: 'sentry-trace', description: 'invalid-format' }],
        },
      ]);

      const result = getNavigationTraceContext();

      expect(result).toBeNull();
    });

    it('decodes URL-encoded baggage', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const sentryTrace = `${traceId}-${spanId}-1`;
      const baggage = 'sentry-environment=production,sentry-release=1.0.0';

      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [
            { name: 'sentry-trace', description: sentryTrace },
            { name: 'baggage', description: encodeURIComponent(baggage) },
          ],
        },
      ]);

      const result = getNavigationTraceContext();

      expect(result?.baggage).toBe(baggage);
    });

    it('handles malformed URL-encoded baggage gracefully', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const sentryTrace = `${traceId}-${spanId}-1`;
      const malformedBaggage = '%E0%A4%A';

      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [
            { name: 'sentry-trace', description: sentryTrace },
            { name: 'baggage', description: malformedBaggage },
          ],
        },
      ]);

      const result = getNavigationTraceContext();

      expect(result?.baggage).toBe(malformedBaggage);
    });
  });

  describe('getNavigationTraceContextAsync', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls callback immediately when cache is populated', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const sentryTrace = `${traceId}-${spanId}-1`;

      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [{ name: 'sentry-trace', description: sentryTrace }],
        },
      ]);

      // Populate cache
      getNavigationTraceContext();

      const callback = vi.fn();
      getNavigationTraceContextAsync(callback);

      expect(callback).toHaveBeenCalledWith({ sentryTrace, baggage: '' });
    });

    it('calls callback with null when Server-Timing is not supported', () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([]);

      const callback = vi.fn();
      getNavigationTraceContextAsync(callback);

      expect(callback).toHaveBeenCalledWith(null);
    });

    it('retries when status is pending and eventually succeeds', async () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const sentryTrace = `${traceId}-${spanId}-1`;

      let callCount = 0;
      mockPerformance.getEntriesByType = vi.fn().mockImplementation(() => {
        callCount++;
        // Calls 1-3: pending (includes isServerTimingSupported check + 2 tryGet attempts)
        // Call 4+: available
        if (callCount <= 3) {
          return [{ responseStart: 0, serverTiming: [] }];
        }
        return [
          {
            responseStart: 100,
            serverTiming: [{ name: 'sentry-trace', description: sentryTrace }],
          },
        ];
      });

      const callback = vi.fn();
      getNavigationTraceContextAsync(callback, 5, 50);

      // First call: isServerTimingSupported (callCount=1)
      // Second call: tryGet #1 (callCount=2), pending, schedules retry
      expect(callback).not.toHaveBeenCalled();

      // After first 50ms: tryGet #2 (callCount=3), still pending, schedules retry
      await vi.advanceTimersByTimeAsync(50);
      expect(callback).not.toHaveBeenCalled();

      // After second 50ms: tryGet #3 (callCount=4), now available
      await vi.advanceTimersByTimeAsync(50);
      expect(callback).toHaveBeenCalledWith({ sentryTrace, baggage: '' });
    });

    it('calls callback with null after max attempts', async () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([{ responseStart: 0, serverTiming: [] }]);

      const callback = vi.fn();
      getNavigationTraceContextAsync(callback, 3, 50);

      expect(callback).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(50);
      expect(callback).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(50);
      expect(callback).toHaveBeenCalledWith(null);
    });

    it('stops retrying when cancelled', async () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([{ responseStart: 0, serverTiming: [] }]);

      const callback = vi.fn();
      const cancel = getNavigationTraceContextAsync(callback, 10, 50);

      await vi.advanceTimersByTimeAsync(50);
      expect(callback).not.toHaveBeenCalled();

      cancel();

      await vi.advanceTimersByTimeAsync(500);
      expect(callback).not.toHaveBeenCalled();
    });

    it('returns cleanup function that can be called immediately', () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [{ name: 'sentry-trace', description: '12345678901234567890123456789012-1234567890123456-1' }],
        },
      ]);

      const callback = vi.fn();
      const cancel = getNavigationTraceContextAsync(callback);

      expect(typeof cancel).toBe('function');
      cancel();
    });

    it('calls callback with null for unavailable state', () => {
      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [],
        },
      ]);

      const callback = vi.fn();
      getNavigationTraceContextAsync(callback);

      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  describe('getMetaTagTraceContext', () => {
    it('returns null when document is not available', () => {
      const originalDocument = mockDocument.querySelector;
      (mockDocument as { querySelector: unknown }).querySelector = undefined;

      expect(getMetaTagTraceContext()).toBeNull();

      mockDocument.querySelector = originalDocument;
    });

    it('returns null when sentry-trace meta tag is not present', () => {
      mockDocument.querySelector = vi.fn().mockReturnValue(null);

      expect(getMetaTagTraceContext()).toBeNull();
    });

    it('returns trace context from meta tags', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const sentryTrace = `${traceId}-${spanId}-1`;
      const baggage = 'sentry-environment=production';

      mockDocument.querySelector = vi.fn().mockImplementation((selector: string) => {
        if (selector === 'meta[name="sentry-trace"]') {
          return { content: sentryTrace };
        }
        if (selector === 'meta[name="baggage"]') {
          return { content: baggage };
        }
        return null;
      });

      const result = getMetaTagTraceContext();

      expect(result).toEqual({
        sentryTrace,
        baggage,
      });
    });

    it('returns trace context with empty baggage when baggage meta tag is not present', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const sentryTrace = `${traceId}-${spanId}-1`;

      mockDocument.querySelector = vi.fn().mockImplementation((selector: string) => {
        if (selector === 'meta[name="sentry-trace"]') {
          return { content: sentryTrace };
        }
        return null;
      });

      const result = getMetaTagTraceContext();

      expect(result).toEqual({
        sentryTrace,
        baggage: '',
      });
    });

    it('returns null for invalid sentry-trace format in meta tag', () => {
      mockDocument.querySelector = vi.fn().mockImplementation((selector: string) => {
        if (selector === 'meta[name="sentry-trace"]') {
          return { content: 'invalid-format' };
        }
        return null;
      });

      const result = getMetaTagTraceContext();

      expect(result).toBeNull();
    });

    it('returns null when sentry-trace meta tag has empty content', () => {
      mockDocument.querySelector = vi.fn().mockImplementation((selector: string) => {
        if (selector === 'meta[name="sentry-trace"]') {
          return { content: '' };
        }
        return null;
      });

      const result = getMetaTagTraceContext();

      expect(result).toBeNull();
    });

    it('handles exceptions gracefully', () => {
      mockDocument.querySelector = vi.fn().mockImplementation(() => {
        throw new Error('DOM error');
      });

      const result = getMetaTagTraceContext();

      expect(result).toBeNull();
    });
  });

  describe('clearNavigationTraceCache', () => {
    it('clears the cache allowing fresh retrieval', () => {
      const traceId = '12345678901234567890123456789012';
      const spanId = '1234567890123456';
      const sentryTrace = `${traceId}-${spanId}-1`;

      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [{ name: 'sentry-trace', description: sentryTrace }],
        },
      ]);

      // First retrieval
      const result1 = getNavigationTraceContext();
      expect(result1).not.toBeNull();

      // Clear cache
      clearNavigationTraceCache();

      // Now change the mock to return different data
      const newTraceId = '98765432109876543210987654321098';
      const newSpanId = '9876543210987654';
      const newSentryTrace = `${newTraceId}-${newSpanId}-0`;

      mockPerformance.getEntriesByType = vi.fn().mockReturnValue([
        {
          responseStart: 100,
          serverTiming: [{ name: 'sentry-trace', description: newSentryTrace }],
        },
      ]);

      // Second retrieval should get new data
      const result2 = getNavigationTraceContext();
      expect(result2?.sentryTrace).toBe(newSentryTrace);
    });
  });
});
