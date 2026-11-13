import type { RequestInfo } from '@cloudflare/workers-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentFetcher } from '../../src/instrumentations/worker/instrumentFetcher';

const { getTraceDataMock } = vi.hoisted(() => ({
  getTraceDataMock: vi.fn(),
}));

/**
 * `_INTERNAL_getTracingHeadersForFetchRequest` imports `getTraceData` from this module, not from the
 * `@sentry/core` barrel — spying on `SentryCore.getTraceData` does not affect it.
 */
vi.mock('../../../core/build/esm/utils/traceData.js', () => ({
  getTraceData: getTraceDataMock,
}));

/** Vitest's `Request` is not typed identically to Workers `RequestInfo`. */
function workerRequest(r: Request): RequestInfo {
  return r as unknown as RequestInfo;
}

describe('instrumentFetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the original fetch with the input and init', async () => {
    getTraceDataMock.mockReturnValue({});

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    await wrapped('https://example.com/path');

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/path', {});
  });

  it('adds sentry-trace and baggage headers', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    await wrapped('https://example.com');

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('sentry-trace')).toBe('12345678901234567890123456789012-1234567890123456-1');
    expect(headers.get('baggage')).toBe('sentry-environment=production');
  });

  it('does not overwrite existing sentry-trace header', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': 'auto-generated-trace',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    await wrapped('https://example.com', {
      headers: { 'sentry-trace': 'manual-trace' },
    });

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('sentry-trace')).toBe('manual-trace');
  });

  it('preserves existing custom headers when adding sentry headers', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    await wrapped('https://example.com', {
      headers: {
        Authorization: 'Bearer my-token',
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value',
      },
    });

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer my-token');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Custom-Header')).toBe('custom-value');
    expect(headers.get('sentry-trace')).toBe('12345678901234567890123456789012-1234567890123456-1');
    expect(headers.get('baggage')).toBe('sentry-environment=production');
  });

  it('preserves headers from a Request object when init has no headers', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    const request = new Request('https://example.com', {
      headers: {
        Authorization: 'Bearer request-token',
        'X-Request-Id': '123',
      },
    });
    await wrapped(workerRequest(request));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [passed] = mockFetch.mock.calls[0]!;
    expect(passed).toBeInstanceOf(Request);
    expect(mockFetch.mock.calls[0]).toHaveLength(1);
    expect((passed as Request).headers.get('Authorization')).toBe('Bearer request-token');
    expect((passed as Request).headers.get('X-Request-Id')).toBe('123');
    expect((passed as Request).headers.get('sentry-trace')).toBe('12345678901234567890123456789012-1234567890123456-1');
    expect((passed as Request).headers.get('baggage')).toBe('sentry-environment=production');
  });

  it('does not overwrite sentry-trace from a Request object', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': 'auto-generated-trace',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    const request = new Request('https://example.com', {
      headers: { 'sentry-trace': 'request-trace-value' },
    });
    await wrapped(workerRequest(request));

    const [passed] = mockFetch.mock.calls[0]!;
    expect(passed).toBeInstanceOf(Request);
    expect(mockFetch.mock.calls[0]).toHaveLength(1);
    expect((passed as Request).headers.get('sentry-trace')).toBe('request-trace-value');
  });

  it('preserves custom headers alongside existing sentry-trace in init', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': 'auto-generated-trace',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    await wrapped('https://example.com', {
      headers: {
        'sentry-trace': 'manual-trace',
        Authorization: 'Bearer my-token',
        'X-Custom': 'value',
      },
    });

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('sentry-trace')).toBe('manual-trace');
    expect(headers.get('Authorization')).toBe('Bearer my-token');
    expect(headers.get('X-Custom')).toBe('value');
  });

  it('works with Headers object in init', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    const existingHeaders = new Headers({
      Authorization: 'Bearer headers-obj-token',
      'X-Custom': 'from-headers-obj',
    });
    await wrapped('https://example.com', { headers: existingHeaders });

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer headers-obj-token');
    expect(headers.get('X-Custom')).toBe('from-headers-obj');
    expect(headers.get('sentry-trace')).toBe('12345678901234567890123456789012-1234567890123456-1');
    expect(headers.get('baggage')).toBe('sentry-environment=production');
  });

  it('works with array-of-tuples headers in init', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    await wrapped('https://example.com', {
      headers: [
        ['Authorization', 'Bearer tuple-token'],
        ['X-Custom', 'from-tuple'],
      ],
    });

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer tuple-token');
    expect(headers.get('X-Custom')).toBe('from-tuple');
    expect(headers.get('sentry-trace')).toBe('12345678901234567890123456789012-1234567890123456-1');
    expect(headers.get('baggage')).toBe('sentry-environment=production');
  });

  it('preserves baggage from Request object and appends sentry baggage', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    const request = new Request('https://example.com', {
      headers: { baggage: 'custom-key=custom-value' },
    });
    await wrapped(workerRequest(request));

    const [passed] = mockFetch.mock.calls[0]!;
    expect(passed).toBeInstanceOf(Request);
    expect(mockFetch.mock.calls[0]).toHaveLength(1);
    expect((passed as Request).headers.get('baggage')).toBe('custom-key=custom-value,sentry-environment=production');
  });

  it('when Request and init are both passed, tracing headers are merged into init', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    const request = new Request('https://example.com', {
      headers: { Authorization: 'Bearer from-request' },
    });
    await wrapped(workerRequest(request), {
      headers: { 'X-From-Init': '1' },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [arg0, arg1] = mockFetch.mock.calls[0]!;
    expect(arg0).toBe(request);
    const headers = new Headers(arg1?.headers);
    expect(headers.get('X-From-Init')).toBe('1');
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('sentry-trace')).toBe('12345678901234567890123456789012-1234567890123456-1');
    expect(headers.get('baggage')).toBe('sentry-environment=production');
  });

  it('forwards method, headers and body when init is a Request', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    // The `stub.fetch(url, request)` Workers idiom: `init` is itself a Request.
    const incoming = new Request('https://example.com/room/ABC/websocket', {
      method: 'POST',
      headers: { Upgrade: 'websocket', 'Content-Type': 'application/json' },
      body: '{"a":1}',
    });

    await wrapped('https://internal/websocket', incoming as unknown as RequestInit);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const forwarded = mockFetch.mock.calls[0]![0] as Request;
    expect(forwarded.method).toBe('POST');
    expect(forwarded.headers.get('upgrade')).toBe('websocket');
    expect(forwarded.headers.get('content-type')).toBe('application/json');
    expect(forwarded.headers.get('sentry-trace')).toBe('12345678901234567890123456789012-1234567890123456-1');
    expect(await forwarded.text()).toBe('{"a":1}');
  });

  it('forwards method and body when init is a Request and tracing is disabled', async () => {
    getTraceDataMock.mockReturnValue({});

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    const incoming = new Request('https://example.com/upload', {
      method: 'POST',
      body: 'payload',
    });

    await wrapped('https://internal/upload', incoming as unknown as RequestInit);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const forwarded = mockFetch.mock.calls[0]![0] as Request;
    expect(forwarded.method).toBe('POST');
    expect(await forwarded.text()).toBe('payload');
  });

  it('appends baggage to existing non-sentry baggage', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    await wrapped('https://example.com', {
      headers: { baggage: 'custom-key=custom-value' },
    });

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('baggage')).toBe('custom-key=custom-value,sentry-environment=production');
  });

  it('does not duplicate sentry baggage values', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    await wrapped('https://example.com', {
      headers: { baggage: 'sentry-environment=staging' },
    });

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('baggage')).toBe('sentry-environment=staging');
  });

  it('passes through original init options', async () => {
    getTraceDataMock.mockReturnValue({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    await wrapped('https://example.com', { method: 'POST', body: 'test' });

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('test');
  });

  it('works when getTraceData returns empty object', async () => {
    getTraceDataMock.mockReturnValue({});

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    await wrapped('https://example.com');

    expect(mockFetch).toHaveBeenCalledWith('https://example.com', {});
  });
});
