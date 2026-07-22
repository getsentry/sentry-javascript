import type { MockedFunction } from 'vitest';
import { describe, beforeEach, vi, expect, it } from 'vitest';
import type { UndiciRequest } from '../../src/integrations/node-fetch/types';
import { addTracePropagationHeadersToFetchRequest } from '../../src/utils/outgoingFetchRequest';
import { LRUMap } from '@sentry/core';
import * as SentryCore from '@sentry/core';

const mockedGetTraceData: MockedFunction<() => ReturnType<typeof SentryCore.getTraceData>> = vi.hoisted(() =>
  vi.fn(() => ({
    'sentry-trace': 'trace_id_1-span_id_1-1',
    baggage: 'sentry-trace_id=trace_id_1,sentry-sampled=true,sentry-environment=staging',
  })),
);

const mockedClientGetOptions: MockedFunction<() => Partial<SentryCore.ClientOptions>> = vi.hoisted(() =>
  vi.fn(() => ({
    tracePropagationTargets: ['https://example.com'],
    propagateTraceparent: true,
  })),
);

vi.mock('@sentry/core', async () => {
  const actual = await vi.importActual('@sentry/core');
  return {
    ...actual,
    getClient: vi.fn(() => ({
      getOptions: mockedClientGetOptions,
    })),
    shouldPropagateTraceForUrl: () => true,
    getTraceData: mockedGetTraceData,
  };
});

describe('addTracePropagationHeadersToFetchRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("doesn't add headers if shouldPropagateTraceForUrl returns false", () => {
    vi.spyOn(SentryCore, 'shouldPropagateTraceForUrl').mockReturnValueOnce(false);

    const request = {
      headers: [] as string[],
      origin: 'https://some-service.com',
      path: '/api/test',
    } as UndiciRequest;

    addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

    expect(request.headers).toEqual([]);
  });

  describe('when headers are an array', () => {
    it('adds sentry-trace and baggage headers to request', () => {
      const request = {
        headers: [] as string[],
        origin: 'https://some-service.com',
        path: '/api/test',
      } as UndiciRequest;

      addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

      expect(request.headers).toEqual([
        'sentry-trace',
        'trace_id_1-span_id_1-1',
        'baggage',
        'sentry-trace_id=trace_id_1,sentry-sampled=true,sentry-environment=staging',
      ]);
    });

    it('adds sentry-trace, baggage and traceparent headers to request', () => {
      mockedGetTraceData.mockReturnValueOnce({
        'sentry-trace': 'trace_id_1-span_id_1-1',
        baggage: 'sentry-trace_id=trace_id_1,sentry-sampled=true,sentry-environment=staging',
        traceparent: '00-trace_id_1-span_id_1-01',
      });

      const request = {
        headers: [] as string[],
        origin: 'https://some-service.com',
        path: '/api/test',
      } as UndiciRequest;

      addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

      expect(request.headers).toEqual([
        'sentry-trace',
        'trace_id_1-span_id_1-1',
        'traceparent',
        '00-trace_id_1-span_id_1-01',
        'baggage',
        'sentry-trace_id=trace_id_1,sentry-sampled=true,sentry-environment=staging',
      ]);
    });

    it('preserves non-sentry entries in existing baggage header', () => {
      const request = {
        headers: ['baggage', 'other=entry,not=sentry'],
        origin: 'https://some-service.com',
        path: '/api/test',
      } as UndiciRequest;

      addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

      expect(request.headers).toEqual([
        'baggage',
        'other=entry,not=sentry,sentry-trace_id=trace_id_1,sentry-sampled=true,sentry-environment=staging',
        'sentry-trace',
        'trace_id_1-span_id_1-1',
      ]);
    });

    it('preserves pre-existing traceparent header', () => {
      mockedGetTraceData.mockReturnValueOnce({
        'sentry-trace': 'trace_id_1-span_id_1-1',
        baggage: 'sentry-trace_id=trace_id_1,sentry-sampled=true,sentry-environment=staging',
        traceparent: '00-trace_id_1-span_id_1-01',
      });

      const request = {
        headers: ['traceparent', '00-some-other-trace_id-span_id_x-01'],
        origin: 'https://some-service.com',
        path: '/api/test',
      } as UndiciRequest;

      addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

      expect(request.headers).toEqual([
        'traceparent',
        '00-some-other-trace_id-span_id_x-01',
        'sentry-trace',
        'trace_id_1-span_id_1-1',
        'baggage',
        'sentry-trace_id=trace_id_1,sentry-sampled=true,sentry-environment=staging',
      ]);
    });

    describe('when sentry-trace is already set', () => {
      it("preserves original sentry-trace header doesn't add baggage", () => {
        const request = {
          headers: ['sentry-trace', 'trace_id_2-span_id_2-1'],
          origin: 'https://some-service.com',
          path: '/api/test',
        } as UndiciRequest;

        addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

        expect(request.headers).toEqual(['sentry-trace', 'trace_id_2-span_id_2-1']);
      });

      it('preserves original baggage header', () => {
        const request = {
          headers: [
            'sentry-trace',
            'trace_id_2-span_id_2-1',
            'baggage',
            'sentry-trace_id=trace_id_2,sentry-sampled=true,sentry-environment=staging',
          ],
          origin: 'https://some-service.com',
          path: '/api/test',
        } as UndiciRequest;

        addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

        expect(request.headers).toEqual([
          'sentry-trace',
          'trace_id_2-span_id_2-1',
          'baggage',
          'sentry-trace_id=trace_id_2,sentry-sampled=true,sentry-environment=staging',
        ]);
      });

      it("doesn't add traceparent header even if propagateTraceparent is true", () => {
        mockedGetTraceData.mockReturnValueOnce({
          'sentry-trace': 'trace_id_2-span_id_2-1',
          baggage: 'sentry-trace_id=trace_id_2,sentry-sampled=true,sentry-environment=staging',
          traceparent: '00-trace_id_2-span_id_2-01',
        });

        const request = {
          headers: ['sentry-trace', 'trace_id_2-span_id_2-1'],
          origin: 'https://some-service.com',
          path: '/api/test',
        } as UndiciRequest;

        addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

        expect(request.headers).toEqual(['sentry-trace', 'trace_id_2-span_id_2-1']);
      });
    });

    describe('pre-existing header deduplication', () => {
      it('deduplicates sentry-trace and baggage headers', () => {
        const request = {
          headers: [
            'sentry-trace',
            'user-trace_id-xyz-1',
            'baggage',
            'sentry-trace_id=user-trace_id-xyz-1,sentry-sampled=true,sentry-environment=user',
            'sentry-trace',
            'undici-trace_id-abc-1',
            'baggage',
            'sentry-trace_id=undici-trace_id-abc-1,sentry-sampled=true,sentry-environment=undici',
          ],
          origin: 'https://some-service.com',
          path: '/api/test',
        } as UndiciRequest;

        addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

        expect(request.headers).toEqual([
          'sentry-trace',
          'user-trace_id-xyz-1',
          'baggage',
          'sentry-trace_id=user-trace_id-xyz-1,sentry-sampled=true,sentry-environment=user',
        ]);
      });

      it('deduplicates traceparent headers if propagateTraceparent is true', () => {
        mockedClientGetOptions.mockReturnValueOnce({
          tracePropagationTargets: ['https://example.com'],
          propagateTraceparent: true,
        });

        const request = {
          headers: [
            'sentry-trace',
            'user-trace_id-xyz-1',
            'baggage',
            'sentry-trace_id=user-trace_id-xyz-1,sentry-sampled=true,sentry-environment=user',
            'traceparent',
            '00-user-trace_id-xyz-1-01',
            'sentry-trace',
            'undici-trace_id-abc-1',
            'baggage',
            'sentry-trace_id=undici-trace_id-abc-1,sentry-sampled=true,sentry-environment=undici',
            'traceparent',
            '00-undici-trace_id-abc-1-01',
          ],
          origin: 'https://some-service.com',
          path: '/api/test',
        } as UndiciRequest;

        addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

        expect(request.headers).toEqual([
          'sentry-trace',
          'user-trace_id-xyz-1',
          'baggage',
          'sentry-trace_id=user-trace_id-xyz-1,sentry-sampled=true,sentry-environment=user',
          'traceparent',
          '00-user-trace_id-xyz-1-01',
        ]);
      });

      // admittedly an unrealistic edge case but doesn't hurt to test it
      it("doesn't crash with incomplete headers array", () => {
        const request = {
          headers: [
            'sentry-trace',
            'user-trace_id-xyz-1',
            'baggage',
            'sentry-trace_id=user-trace_id-xyz-1,sentry-sampled=true,sentry-environment=user',
            'sentry-trace',
            'undici-trace_id-abc-1',
            'baggage',
            'sentry-trace_id=undici-trace_id-abc-1,sentry-sampled=true,sentry-environment=undici',
            'baggage', // only the key, no value
          ],
          origin: 'https://some-service.com',
          path: '/api/test',
        } as UndiciRequest;

        addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

        expect(request.headers).toEqual([
          'sentry-trace',
          'user-trace_id-xyz-1',
          'baggage',
          'sentry-trace_id=user-trace_id-xyz-1,sentry-sampled=true,sentry-environment=user',
        ]);
      });

      it('dedupes multiple baggage headers with sentry- values keeps non-sentry values around', () => {
        const request = {
          headers: [
            'sentry-trace',
            'user-trace_id-xyz-1',
            'baggage',
            'user-added=value,another=one',
            'baggage',
            'yet-another=value,another=two',
            'sentry-trace',
            'undici-trace_id-abc-1',
            'baggage',
            'sentry-trace_id=undici-trace_id-abc-1,sentry-sampled=true,sentry-environment=undici,',
          ],
          origin: 'https://some-service.com',
          path: '/api/test',
        } as UndiciRequest;

        addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

        expect(request.headers).toEqual([
          'sentry-trace',
          'user-trace_id-xyz-1',
          'baggage',
          'sentry-trace_id=undici-trace_id-abc-1,sentry-sampled=true,sentry-environment=undici,yet-another=value,another=two,user-added=value',
        ]);
      });

      it('dedupes multiple baggage headers keeps non-sentry values around', () => {
        const request = {
          headers: ['baggage', 'user-added=value,another=one', 'baggage', 'yet-another=value,another=two'],
          origin: 'https://some-service.com',
          path: '/api/test',
        } as UndiciRequest;

        addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

        expect(request.headers).toEqual([
          'baggage',
          'yet-another=value,another=two,user-added=value,sentry-trace_id=trace_id_1,sentry-sampled=true,sentry-environment=staging',
          'sentry-trace',
          'trace_id_1-span_id_1-1',
        ]);
      });
    });

    it('doesn\'t mistake a header value with "sentry-trace" for a sentry-trace header', () => {
      const request = {
        headers: ['x-allow-header', 'sentry-trace'],
        origin: 'https://some-service.com',
        path: '/api/test',
      } as UndiciRequest;

      addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

      expect(request.headers).toEqual([
        'x-allow-header',
        'sentry-trace',
        'sentry-trace',
        'trace_id_1-span_id_1-1',
        'baggage',
        'sentry-trace_id=trace_id_1,sentry-sampled=true,sentry-environment=staging',
      ]);
    });

    it('doesn\'t mistake a header value with "baggage" for a sentry-trace header', () => {
      const request = {
        headers: ['x-allow-header', 'baggage'],
        origin: 'https://some-service.com',
        path: '/api/test',
      } as UndiciRequest;

      addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

      expect(request.headers).toEqual([
        'x-allow-header',
        'baggage',
        'sentry-trace',
        'trace_id_1-span_id_1-1',
        'baggage',
        'sentry-trace_id=trace_id_1,sentry-sampled=true,sentry-environment=staging',
      ]);
    });
  });

  describe('when headers are a string', () => {
    it('adds sentry-trace and baggage headers to request', () => {
      const request = {
        headers: '',
        origin: 'https://some-service.com',
        path: '/api/test',
      } as UndiciRequest;

      addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

      expect(request.headers).toBe(
        'sentry-trace: trace_id_1-span_id_1-1\r\n' +
          'baggage: sentry-trace_id=trace_id_1,sentry-sampled=true,sentry-environment=staging\r\n',
      );
    });

    describe('when sentry-trace is already set', () => {
      it("preserves original sentry-trace header doesn't add baggage", () => {
        const request = {
          headers: 'sentry-trace: trace_id_2-span_id_2-1\r\n',
          origin: 'https://some-service.com',
          path: '/api/test',
        } as UndiciRequest;

        addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

        expect(request.headers).toBe('sentry-trace: trace_id_2-span_id_2-1\r\n');
      });

      it('preserves the original baggage header', () => {
        const request = {
          headers:
            'sentry-trace: trace_id_2-span_id_2-1\r\n' +
            'baggage: sentry-trace_id=trace_id_2,sentry-sampled=true,sentry-environment=staging\r\n',
          origin: 'https://some-service.com',
          path: '/api/test',
        } as UndiciRequest;

        addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

        expect(request.headers).toBe(
          'sentry-trace: trace_id_2-span_id_2-1\r\n' +
            'baggage: sentry-trace_id=trace_id_2,sentry-sampled=true,sentry-environment=staging\r\n',
        );
      });
    });

    describe('pre-existing header deduplication', () => {
      it('deduplicates sentry-trace and baggage headers', () => {
        const request = {
          headers:
            'sentry-trace: user-trace_id-xyz-1\r\n' +
            'baggage: sentry-trace_id=user-trace_id,sentry-sampled=true,sentry-environment=user\r\n' +
            'sentry-trace: undici-trace_id-abc-1\r\n' +
            'baggage: sentry-trace_id=undici-trace_id-abc-1,sentry-sampled=true,sentry-environment=undici\r\n',
          origin: 'https://some-service.com',
          path: '/api/test',
        } as UndiciRequest;

        addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

        expect(request.headers).toBe(
          'sentry-trace: user-trace_id-xyz-1\r\n' +
            'baggage: sentry-trace_id=user-trace_id,sentry-sampled=true,sentry-environment=user\r\n',
        );
      });

      it("doesn't crash with incomplete headers string", () => {
        const request = {
          headers:
            'sentry-trace: user-trace_id-xyz-1\r\n' +
            'baggage: sentry-trace_id=user-trace_id,sentry-sampled=true,sentry-environment=user\r\n' +
            'sentry-trace: undici-trace_id-abc-1\r\n' +
            'baggage: sentry-trace_id=undici-trace_id-abc-1,sentry-sampled=true,sentry-environment=undici\r\n' +
            'baggage: \r\n',
          origin: 'https://some-service.com',
          path: '/api/test',
        } as UndiciRequest;

        addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

        expect(request.headers).toBe(
          'sentry-trace: user-trace_id-xyz-1\r\n' +
            'baggage: sentry-trace_id=user-trace_id,sentry-sampled=true,sentry-environment=user\r\n',
        );
      });
    });

    it("doesn't dedupe nearly-sentry-tracing headers", () => {
      const request = {
        headers:
          'sentry-trace: user-trace_id-xyz-1\r\n' +
          'baggage: sentry-trace_id=user-trace_id,sentry-sampled=true,sentry-environment=user\r\n' +
          'x-sentry-trace: custom-trace_id-abc-1\r\n' +
          'x-baggage: sentry-trace_id=undici-trace_id-abc-1,sentry-sampled=true,sentry-environment=undici\r\n',
        origin: 'https://some-service.com',
        path: '/api/test',
      } as UndiciRequest;

      addTracePropagationHeadersToFetchRequest(request, new LRUMap<string, boolean>(100));

      expect(request.headers).toBe(
        'sentry-trace: user-trace_id-xyz-1\r\n' +
          'baggage: sentry-trace_id=user-trace_id,sentry-sampled=true,sentry-environment=user\r\n' +
          'x-sentry-trace: custom-trace_id-abc-1\r\n' +
          'x-baggage: sentry-trace_id=undici-trace_id-abc-1,sentry-sampled=true,sentry-environment=undici\r\n',
      );
    });
  });
});
