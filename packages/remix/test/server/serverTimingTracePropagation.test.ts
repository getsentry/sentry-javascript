import {
  getActiveSpan,
  getDynamicSamplingContextFromSpan,
  getRootSpan,
  getTraceData,
  isNodeEnv,
  spanToTraceHeader,
} from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addSentryServerTimingHeader,
  generateSentryServerTimingHeader,
  injectServerTimingHeaderValue,
  isCloudflareEnv,
  mergeSentryServerTimingHeader,
} from '../../src/server/serverTimingTracePropagation';

// Mock @sentry/core - vi.mock is hoisted automatically
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
  getDynamicSamplingContextFromSpan: vi.fn(() => ({
    trace_id: '12345678901234567890123456789012',
    environment: 'production',
    release: '1.0.0',
  })),
  spanToTraceHeader: vi.fn(() => '12345678901234567890123456789012-1234567890123456-1'),
  isNodeEnv: vi.fn(() => true),
}));

describe('serverTimingTracePropagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNodeEnv).mockReturnValue(true);
    vi.mocked(getActiveSpan).mockReturnValue(mockSpan);
    vi.mocked(getRootSpan).mockReturnValue(mockRootSpan);
    vi.mocked(spanToTraceHeader).mockReturnValue('12345678901234567890123456789012-1234567890123456-1');
    vi.mocked(getTraceData).mockReturnValue({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production,sentry-release=1.0.0',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up navigator mock
    vi.unstubAllGlobals();
  });

  describe('isCloudflareEnv', () => {
    it('returns false when navigator is not available', () => {
      expect(isCloudflareEnv()).toBe(false);
    });

    it('returns false when navigator.userAgent does not include Cloudflare', () => {
      vi.stubGlobal('navigator', { userAgent: 'Node.js' });

      expect(isCloudflareEnv()).toBe(false);
    });

    it('returns true when navigator.userAgent includes Cloudflare', () => {
      vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });

      expect(isCloudflareEnv()).toBe(true);
    });
  });

  describe('generateSentryServerTimingHeader', () => {
    it('returns null when not in Node.js or Cloudflare environment', () => {
      vi.mocked(isNodeEnv).mockReturnValue(false);

      expect(generateSentryServerTimingHeader()).toBeNull();
    });

    it('returns null when no span and no trace data is available', () => {
      vi.mocked(getActiveSpan).mockReturnValue(undefined);
      vi.mocked(getTraceData).mockReturnValue({});

      expect(generateSentryServerTimingHeader()).toBeNull();
    });

    it('generates header with sentry-trace and baggage from active span', () => {
      const result = generateSentryServerTimingHeader();

      expect(result).toContain('sentry-trace;desc="12345678901234567890123456789012-1234567890123456-1"');
      expect(result).toContain('baggage;desc=');
      // Baggage is escaped for quoted-string context (not URL-encoded)
      expect(result).toContain('sentry-environment=production,sentry-release=1.0.0');
    });

    it('generates header without baggage when includeBaggage is false', () => {
      const result = generateSentryServerTimingHeader({ includeBaggage: false });

      expect(result).toContain('sentry-trace;desc="12345678901234567890123456789012-1234567890123456-1"');
      expect(result).not.toContain('baggage');
    });

    it('uses explicitly provided span', () => {
      const customSpan = {
        spanId: 'custom-span',
        spanContext: () => ({ traceId: 'custom-trace-id' }),
      };
      vi.mocked(spanToTraceHeader).mockReturnValue('custom-trace-id-custom-span-id-1');
      vi.mocked(getTraceData).mockReturnValue({
        'sentry-trace': 'custom-trace-id-custom-span-id-1',
        baggage: 'sentry-custom=value',
      });

      const result = generateSentryServerTimingHeader({ span: customSpan });

      expect(spanToTraceHeader).toHaveBeenCalledWith(customSpan);
      expect(result).toContain('sentry-trace;desc="custom-trace-id-custom-span-id-1"');
    });

    it('falls back to getTraceData when no span is available', () => {
      vi.mocked(getActiveSpan).mockReturnValue(undefined);
      vi.mocked(getTraceData).mockReturnValue({
        'sentry-trace': 'fallback-trace-id-1234567890123456-0',
        baggage: 'sentry-fallback=true',
      });

      const result = generateSentryServerTimingHeader();

      expect(result).toContain('sentry-trace;desc="fallback-trace-id-1234567890123456-0"');
      // Baggage is escaped for quoted-string context (not URL-encoded)
      expect(result).toContain('sentry-fallback=true');
    });

    it('works in Cloudflare environment', () => {
      vi.mocked(isNodeEnv).mockReturnValue(false);
      vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' });

      const result = generateSentryServerTimingHeader();

      expect(result).toContain('sentry-trace');
    });

    it('returns header without baggage when baggage is empty', () => {
      vi.mocked(getTraceData).mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
        baggage: '',
      });
      vi.mocked(getDynamicSamplingContextFromSpan).mockReturnValue({});

      const result = generateSentryServerTimingHeader();

      expect(result).toBe('sentry-trace;desc="12345678901234567890123456789012-1234567890123456-1"');
    });

    it('returns header without baggage when baggage is undefined', () => {
      vi.mocked(getTraceData).mockReturnValue({
        'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      });
      vi.mocked(getDynamicSamplingContextFromSpan).mockReturnValue({});

      const result = generateSentryServerTimingHeader();

      expect(result).toBe('sentry-trace;desc="12345678901234567890123456789012-1234567890123456-1"');
    });
  });

  describe('mergeSentryServerTimingHeader', () => {
    it('returns empty string when no existing header and no sentry timing', () => {
      vi.mocked(isNodeEnv).mockReturnValue(false);

      expect(mergeSentryServerTimingHeader(null)).toBe('');
      expect(mergeSentryServerTimingHeader(undefined)).toBe('');
    });

    it('returns sentry timing when no existing header', () => {
      const result = mergeSentryServerTimingHeader(null);

      expect(result).toContain('sentry-trace');
    });

    it('returns existing header when sentry timing cannot be generated', () => {
      vi.mocked(isNodeEnv).mockReturnValue(false);

      expect(mergeSentryServerTimingHeader('cache;dur=100')).toBe('cache;dur=100');
    });

    it('merges existing header with sentry timing', () => {
      const result = mergeSentryServerTimingHeader('cache;dur=100');

      expect(result).toContain('cache;dur=100');
      expect(result).toContain('sentry-trace');
      expect(result).toContain(', ');
    });
  });

  describe('injectServerTimingHeaderValue', () => {
    it('returns original response when body is already used', () => {
      const mockResponse = {
        bodyUsed: true,
        headers: new Headers(),
      } as Response;

      const result = injectServerTimingHeaderValue(mockResponse, 'sentry-trace;desc="test"');

      expect(result).toBe(mockResponse);
    });

    it('adds Server-Timing header to response without existing header', () => {
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

    it('preserves response body', async () => {
      const mockResponse = new Response('test body content', {
        status: 200,
      });

      const result = injectServerTimingHeaderValue(mockResponse, 'sentry-trace;desc="test"');

      const body = await result.text();
      expect(body).toBe('test body content');
    });

    it('returns original response on error', () => {
      // Create a response that will throw when cloned
      const mockResponse = {
        bodyUsed: false,
        headers: {
          get: () => {
            throw new Error('Header error');
          },
        },
        body: null,
        status: 200,
        statusText: 'OK',
      } as unknown as Response;

      const result = injectServerTimingHeaderValue(mockResponse, 'sentry-trace;desc="test"');

      expect(result).toBe(mockResponse);
    });
  });

  describe('addSentryServerTimingHeader', () => {
    it('returns original response when sentry timing cannot be generated', () => {
      vi.mocked(isNodeEnv).mockReturnValue(false);

      const mockResponse = new Response('test');
      const result = addSentryServerTimingHeader(mockResponse);

      expect(result).toBe(mockResponse);
    });

    it('adds Server-Timing header with trace data', () => {
      const mockResponse = new Response('test');

      const result = addSentryServerTimingHeader(mockResponse);

      expect(result.headers.get('Server-Timing')).toContain('sentry-trace');
    });

    it('respects options passed to generateSentryServerTimingHeader', () => {
      const mockResponse = new Response('test');

      const result = addSentryServerTimingHeader(mockResponse, { includeBaggage: false });

      expect(result.headers.get('Server-Timing')).not.toContain('baggage');
    });

    it('uses provided span option', () => {
      const customSpan = {
        spanId: 'custom',
        spanContext: () => ({ traceId: 'custom-trace-id' }),
      };
      vi.mocked(spanToTraceHeader).mockReturnValue('custom-trace-header');
      vi.mocked(getTraceData).mockReturnValue({
        'sentry-trace': 'custom-trace-header',
        baggage: 'custom-baggage',
      });

      const mockResponse = new Response('test');
      const result = addSentryServerTimingHeader(mockResponse, { span: customSpan });

      expect(spanToTraceHeader).toHaveBeenCalledWith(customSpan);
      expect(result.headers.get('Server-Timing')).toContain('custom-trace-header');
    });
  });
});
