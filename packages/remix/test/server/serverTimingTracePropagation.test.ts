import { getTraceServerTimingHeader } from '@sentry/core';
import { isNodeEnv } from '@sentry/core/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateSentryServerTimingHeader,
  injectServerTimingHeaderValue,
} from '../../src/server/serverTimingTracePropagation';

vi.mock('@sentry/core', () => ({
  debug: {
    log: vi.fn(),
    warn: vi.fn(),
  },
  getTraceServerTimingHeader: vi.fn(
    () =>
      'sentry-trace;desc="12345678901234567890123456789012-1234567890123456-1", baggage;desc="sentry-environment=production,sentry-release=1.0.0"',
  ),
}));

vi.mock('@sentry/core/server', () => ({
  isNodeEnv: vi.fn(() => true),
}));

describe('serverTimingTracePropagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNodeEnv).mockReturnValue(true);
  });

  describe('generateSentryServerTimingHeader', () => {
    it('returns null in browser environments', () => {
      vi.mocked(isNodeEnv).mockReturnValueOnce(false);

      expect(generateSentryServerTimingHeader()).toBeNull();
    });

    it('returns null without trace data', () => {
      vi.mocked(getTraceServerTimingHeader).mockReturnValueOnce('');

      expect(generateSentryServerTimingHeader()).toBeNull();
    });

    it('returns the Server-Timing value of the current trace', () => {
      expect(generateSentryServerTimingHeader()).toBe(
        'sentry-trace;desc="12345678901234567890123456789012-1234567890123456-1", baggage;desc="sentry-environment=production,sentry-release=1.0.0"',
      );
    });

    it('generates header in Cloudflare environment when isNodeEnv is false', () => {
      vi.mocked(isNodeEnv).mockReturnValueOnce(false);

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

    it('skips injection when sentry-trace already exists in Server-Timing header', () => {
      const mockResponse = new Response('test body', {
        status: 200,
        headers: new Headers({
          'Server-Timing': 'sentry-trace;desc="existing-trace", baggage;desc="existing-baggage"',
        }),
      });

      const result = injectServerTimingHeaderValue(
        mockResponse,
        'sentry-trace;desc="new-trace", baggage;desc="new-baggage"',
      );

      expect(result.headers.get('Server-Timing')).toBe(
        'sentry-trace;desc="existing-trace", baggage;desc="existing-baggage"',
      );
    });
  });
});
