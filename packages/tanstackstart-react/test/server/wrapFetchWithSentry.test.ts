import { afterEach, describe, expect, it, vi } from 'vitest';

const startSpanSpy = vi.fn((_, callback) => callback());
const flushIfServerlessSpy = vi.fn().mockResolvedValue(undefined);

const captureExceptionSpy = vi.fn();

vi.mock('@sentry/node', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    startSpan: (...args: unknown[]) => startSpanSpy(...args),
    captureException: (...args: unknown[]) => captureExceptionSpy(...args),
  };
});

const getTraceMetaTagsSpy = vi
  .fn()
  .mockReturnValue(
    '<meta name="sentry-trace" content="abc123-def456-1"/>\n<meta name="baggage" content="sentry-trace_id=abc123"/>',
  );

vi.mock('@sentry/core', async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    flushIfServerless: (...args: unknown[]) => flushIfServerlessSpy(...args),
    getTraceMetaTags: () => getTraceMetaTagsSpy(),
  };
});

// Import after mocks are set up
const { wrapFetchWithSentry } = await import('../../src/server/wrapFetchWithSentry');

describe('wrapFetchWithSentry', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls flushIfServerless after a regular request', async () => {
    const mockResponse = new Response('ok');
    const fetchFn = vi.fn().mockResolvedValue(mockResponse);

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const request = new Request('http://localhost:3000/page');

    await serverEntry.fetch(request);

    expect(fetchFn).toHaveBeenCalled();
    expect(flushIfServerlessSpy).toHaveBeenCalledTimes(1);
  });

  it('calls flushIfServerless after a server function request', async () => {
    const mockResponse = new Response('ok');
    const fetchFn = vi.fn().mockResolvedValue(mockResponse);

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const request = new Request('http://localhost:3000/_serverFn/abc123');

    await serverEntry.fetch(request);

    expect(startSpanSpy).toHaveBeenCalled();
    expect(flushIfServerlessSpy).toHaveBeenCalledTimes(1);
  });

  it('injects meta tags into HTML responses', async () => {
    const mockResponse = new Response('<head><meta charset="utf-8"/></head><body></body>', {
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    });
    const fetchFn = vi.fn().mockResolvedValue(mockResponse);

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const request = new Request('http://localhost:3000/');

    const response = await serverEntry.fetch(request);
    const html = await response.text();

    expect(html).toContain('<meta name="sentry-trace" content="abc123-def456-1"/>');
    expect(html).toContain('<meta name="baggage" content="sentry-trace_id=abc123"/>');
    expect(html).toContain('<meta charset="utf-8"/>');
  });

  it('does not inject meta tags into non-HTML responses', async () => {
    const mockResponse = new Response('{"data": "value"}', {
      headers: new Headers({ 'content-type': 'application/json' }),
    });
    const fetchFn = vi.fn().mockResolvedValue(mockResponse);

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const request = new Request('http://localhost:3000/_serverFn/abc123');

    const response = await serverEntry.fetch(request);
    const body = await response.text();

    expect(body).toBe('{"data": "value"}');
    expect(body).not.toContain('sentry-trace');
  });

  it('does not inject duplicate meta tags if sentry-trace already exists', async () => {
    const existingHtml =
      '<head><meta name="sentry-trace" content="existing-trace"/><meta name="baggage" content="existing-baggage"/></head>';
    const mockResponse = new Response(existingHtml, {
      headers: new Headers({ 'content-type': 'text/html' }),
    });
    const fetchFn = vi.fn().mockResolvedValue(mockResponse);

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const request = new Request('http://localhost:3000/');

    const response = await serverEntry.fetch(request);
    const html = await response.text();

    expect(html).toBe(existingHtml);
  });

  it('preserves response status and headers when injecting meta tags', async () => {
    const mockResponse = new Response('<head></head>', {
      status: 201,
      statusText: 'Created',
      headers: new Headers({
        'content-type': 'text/html',
        'X-Custom-Header': 'custom-value',
      }),
    });
    const fetchFn = vi.fn().mockResolvedValue(mockResponse);

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const request = new Request('http://localhost:3000/');

    const response = await serverEntry.fetch(request);

    expect(response.status).toBe(201);
    expect(response.statusText).toBe('Created');
    expect(response.headers.get('content-type')).toBe('text/html');
    expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
  });

  it('does not inject meta tags into <head> inside quoted attribute values', async () => {
    const mockResponse = new Response('<head></head><body><div data-content="<head>ignore"></div></body>', {
      headers: new Headers({ 'content-type': 'text/html' }),
    });
    const fetchFn = vi.fn().mockResolvedValue(mockResponse);

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const request = new Request('http://localhost:3000/');

    const response = await serverEntry.fetch(request);
    const html = await response.text();

    expect(html).toContain('<head><meta name="sentry-trace"');
    expect(html).toContain('data-content="<head>ignore"');
  });

  it('captures exception when HTML response body stream errors', async () => {
    const streamError = new Error('stream read error');
    const body = new ReadableStream({
      start(controller) {
        controller.error(streamError);
      },
    });
    const mockResponse = new Response(body, {
      headers: new Headers({ 'content-type': 'text/html' }),
    });
    const fetchFn = vi.fn().mockResolvedValue(mockResponse);

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const request = new Request('http://localhost:3000/');

    const response = await serverEntry.fetch(request);

    try {
      await response.text();
    } catch {
      // expected — the stream errors
    }

    expect(captureExceptionSpy).toHaveBeenCalledWith(streamError, {
      mechanism: { type: 'auto.http.tanstackstart', handled: false },
    });
  });

  it('calls flushIfServerless even if the handler throws', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('handler error'));

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const request = new Request('http://localhost:3000/page');

    await expect(serverEntry.fetch(request)).rejects.toThrow('handler error');

    expect(flushIfServerlessSpy).toHaveBeenCalledTimes(1);
  });
});
