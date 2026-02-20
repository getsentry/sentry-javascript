import { getActiveSpan, getTraceData, isNodeEnv, spanToBaggageHeader, spanToTraceHeader } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateSentryServerTimingHeader,
  injectServerTimingHeaderValue,
} from '../../src/server/serverTimingTracePropagation';

const mockSpan = {
  spanId: 'test-span-id',
  spanContext: () => ({ traceId: '12345678901234567890123456789012' }),
};
const mockRootSpan = {
  spanId: 'root-span-id',
  spanContext: () => ({ traceId: '12345678901234567890123456789012' }),
};

vi.mock('@sentry/core', () => ({
  debug: {
    log: vi.fn(),
    warn: vi.fn(),
  },
  getActiveSpan: vi.fn(),
  getRootSpan: vi.fn(() => mockRootSpan),
  getTraceData: vi.fn(() => ({
    'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
    baggage: 'sentry-environment=production,sentry-release=1.0.0',
  })),
  spanToTraceHeader: vi.fn(() => '12345678901234567890123456789012-1234567890123456-1'),
  spanToBaggageHeader: vi.fn(() => 'sentry-environment=production,sentry-release=1.0.0'),
  isNodeEnv: vi.fn(() => true),
}));

describe('serverTimingTracePropagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNodeEnv).mockReturnValue(true);
    vi.mocked(getActiveSpan).mockReturnValue(mockSpan);
  });

  describe('generateSentryServerTimingHeader', () => {
    it('returns null in browser environments', () => {
      vi.mocked(isNodeEnv).mockReturnValue(false);

      expect(generateSentryServerTimingHeader()).toBeNull();
    });

    it('returns null without trace data', () => {
      vi.mocked(getActiveSpan).mockReturnValue(undefined);
      vi.mocked(getTraceData).mockReturnValue({});

      expect(generateSentryServerTimingHeader()).toBeNull();
    });

    it('produces correct Server-Timing format', () => {
      const result = generateSentryServerTimingHeader();

      expect(result).toBe(
        'sentry-trace;desc="12345678901234567890123456789012-1234567890123456-1", baggage;desc="sentry-environment=production,sentry-release=1.0.0"',
      );
    });

    it('falls back to getTraceData without active span', () => {
      vi.mocked(getActiveSpan).mockReturnValue(undefined);
      vi.mocked(getTraceData).mockReturnValue({
        'sentry-trace': 'fallback-trace-id-1234567890123456-0',
        baggage: 'sentry-fallback=true',
      });

      const result = generateSentryServerTimingHeader();

      expect(result).toContain('sentry-trace;desc="fallback-trace-id-1234567890123456-0"');
      expect(result).toContain('sentry-fallback=true');
    });

    it('uses the provided span directly instead of resolving from active span', () => {
      const directSpan = { spanId: 'direct-span-id', spanContext: () => ({ traceId: 'abc' }) };

      const result = generateSentryServerTimingHeader(directSpan as any);

      expect(spanToTraceHeader).toHaveBeenCalledWith(directSpan);
      expect(spanToBaggageHeader).toHaveBeenCalledWith(directSpan);
      expect(result).toBeDefined();
    });

    it('generates header in Cloudflare environment when isNodeEnv is false', () => {
      vi.mocked(isNodeEnv).mockReturnValue(false);

      const originalNavigator = globalThis.navigator;
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Cloudflare' },
        configurable: true,
      });

      const result = generateSentryServerTimingHeader();
      expect(result).not.toBeNull();

      // Restore
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
      });
    });
  });

  describe('injectServerTimingHeaderValue', () => {
    it('adds Server-Timing header to response', () => {
      const mockResponse = new Response('test body', {
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
      });

      const result = injectServerTimingHeaderValue(mockResponse, 'sentry-trace;desc="test"');

      expect(result.headers.get('Server-Timing')).toBe('sentry-trace;desc="test"');
      expect(result.status).toBe(200);
      expect(result.statusText).toBe('OK');
    });

    it('merges with existing Server-Timing header', () => {
      const mockResponse = new Response('test body', {
        status: 200,
        headers: new Headers({ 'Server-Timing': 'cache;dur=100' }),
      });

      const result = injectServerTimingHeaderValue(mockResponse, 'sentry-trace;desc="test"');

      expect(result.headers.get('Server-Timing')).toBe('cache;dur=100, sentry-trace;desc="test"');
    });
  });
});
