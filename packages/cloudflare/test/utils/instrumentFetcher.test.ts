import * as SentryCore from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instrumentFetcher } from '../../src/instrumentations/worker/instrumentFetcher';

describe('instrumentFetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the original fetch with the input and init', async () => {
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({});

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    await wrapped('https://example.com/path');

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/path', {});
  });

  it('adds sentry-trace and baggage headers', async () => {
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
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
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
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
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
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
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
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
    await wrapped(request);

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer request-token');
    expect(headers.get('X-Request-Id')).toBe('123');
    expect(headers.get('sentry-trace')).toBe('12345678901234567890123456789012-1234567890123456-1');
    expect(headers.get('baggage')).toBe('sentry-environment=production');
  });

  it('does not overwrite sentry-trace from a Request object', async () => {
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
      'sentry-trace': 'auto-generated-trace',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    const request = new Request('https://example.com', {
      headers: { 'sentry-trace': 'request-trace-value' },
    });
    await wrapped(request);

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('sentry-trace')).toBe('request-trace-value');
  });

  it('preserves custom headers alongside existing sentry-trace in init', async () => {
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
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
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
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
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
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
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
      'sentry-trace': '12345678901234567890123456789012-1234567890123456-1',
      baggage: 'sentry-environment=production',
    });

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    const request = new Request('https://example.com', {
      headers: { baggage: 'custom-key=custom-value' },
    });
    await wrapped(request);

    const [, init] = mockFetch.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get('baggage')).toBe('custom-key=custom-value,sentry-environment=production');
  });

  it('appends baggage to existing non-sentry baggage', async () => {
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
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
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
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
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({
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
    vi.spyOn(SentryCore, 'getTraceData').mockReturnValue({});

    const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const wrapped = instrumentFetcher(mockFetch);

    await wrapped('https://example.com');

    expect(mockFetch).toHaveBeenCalledWith('https://example.com', {});
  });
});
