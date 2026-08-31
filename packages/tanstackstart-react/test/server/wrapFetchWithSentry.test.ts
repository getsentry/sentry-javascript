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
    '<meta name="sentry-trace" content="abc123-def456-1"/><meta name="baggage" content="sentry-trace_id=abc123"/>',
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

  it('creates a function span for server function requests', async () => {
    const mockResponse = new Response('ok');
    const fetchFn = vi.fn().mockResolvedValue(mockResponse);

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const request = new Request('http://localhost:3000/_serverFn/abc123');

    await serverEntry.fetch(request);

    expect(startSpanSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'GET /_serverFn/abc123',
        attributes: expect.objectContaining({
          'sentry.op': 'function',
        }),
      }),
      expect.any(Function),
    );
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

    // No whitespace text node may appear directly after `<head>` or between the injected tags —
    // React 19 whole-document hydration rejects unexpected text nodes in `<head>` (#21915).
    expect(html).toContain(
      '<head><meta name="sentry-trace" content="abc123-def456-1"/><meta name="baggage" content="sentry-trace_id=abc123"/>',
    );
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

describe('wrapFetchWithSentry meta tag injection across stream chunks', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function streamHtml(chunks: (string | Uint8Array)[]): Promise<string> {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
        }
        controller.close();
      },
    });

    const fetchFn = vi.fn().mockResolvedValue(
      new Response(body, {
        headers: new Headers({ 'content-type': 'text/html' }),
      }),
    );

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    return serverEntry.fetch(new Request('http://localhost:3000/')).then(response => response.text());
  }

  function countTraceMetaTags(html: string): number {
    return html.split('name="sentry-trace"').length - 1;
  }

  // React's Fizz writer flushes when its 2048 byte view fills and writes any longer string
  // on its own, so a long attribute value puts a chunk boundary right after its opening
  // quote. See https://github.com/getsentry/sentry-javascript/issues/23468.
  it('injects the meta tags when a chunk boundary splits an attribute value before <head>', async () => {
    const html = await streamHtml([
      '<!DOCTYPE html><html lang="en" data-ssr-state="',
      '{&quot;theme&quot;:&quot;dark&quot;}',
      '"><head><meta charSet="utf-8"/></head><body>b</body></html>',
    ]);

    expect(countTraceMetaTags(html)).toBe(1);
    expect(html).toContain('<head><meta name="sentry-trace" content="abc123-def456-1"/>');
    expect(html).toContain('data-ssr-state="{&quot;theme&quot;:&quot;dark&quot;}"');
  });

  it('injects the meta tags when the <head> tag itself is split across chunks', async () => {
    const html = await streamHtml(['<!DOCTYPE html><html><he', 'ad><title>t</title></head><body>b</body></html>']);

    expect(countTraceMetaTags(html)).toBe(1);
    expect(html).toContain('<head><meta name="sentry-trace" content="abc123-def456-1"/>');
  });

  it('produces the same output wherever the response is split', async () => {
    const document =
      '<!DOCTYPE html><html lang="en" data-x="a&quot;b"><head><meta charSet="utf-8"/><title>App</title></head><body><div id="root">hi</div></body></html>';

    const unsplit = await streamHtml([document]);
    expect(countTraceMetaTags(unsplit)).toBe(1);

    for (let i = 1; i < document.length; i++) {
      const split = await streamHtml([document.slice(0, i), document.slice(i)]);
      expect(split).toBe(unsplit);
    }

    expect(await streamHtml([...document])).toBe(unsplit);
  });

  it('injects the meta tags only once when a later chunk also contains <head>', async () => {
    const html = await streamHtml([
      '<html><head><title>t</title></head><body>',
      '<pre data-code="<head>">x</pre></body></html>',
    ]);

    expect(countTraceMetaTags(html)).toBe(1);
    expect(html).toContain('data-code="<head>"');
  });

  it('does not inject when the existing sentry-trace meta tag is split across chunks', async () => {
    const html = await streamHtml([
      '<html><head><meta name="sentry-',
      'trace" content="existing-trace"/></head><body>b</body></html>',
    ]);

    expect(countTraceMetaTags(html)).toBe(1);
    expect(html).toContain('content="existing-trace"');
    expect(html).not.toContain('abc123-def456-1');
  });

  // TanStack's router stream pauses reading React while its own `desiredSize` is at or
  // below zero. Draining it regardless lets everything React emits after `</body>` pile up
  // in its bounded tail buffer. See https://github.com/getsentry/sentry-javascript/issues/23468.
  it('does not read the body until the response is consumed', async () => {
    const encoder = new TextEncoder();
    let pulled = 0;

    const body = new ReadableStream({
      pull(controller) {
        pulled++;
        controller.enqueue(encoder.encode(pulled === 1 ? '<html><head></head><body>' : `<p>${pulled}</p>`));
      },
    });

    const fetchFn = vi.fn().mockResolvedValue(
      new Response(body, {
        headers: new Headers({ 'content-type': 'text/html' }),
      }),
    );

    const serverEntry = wrapFetchWithSentry({ fetch: fetchFn });
    const response = await serverEntry.fetch(new Request('http://localhost:3000/'));

    // Give an eager implementation every chance to run away with the body.
    for (let i = 0; i < 50; i++) {
      await Promise.resolve();
    }

    expect(pulled).toBeLessThan(10);

    const consumed = pulled;
    await response.body!.getReader().read();
    expect(pulled).toBeGreaterThanOrEqual(consumed);
  });

  it('keeps multi-byte characters intact when they straddle a chunk boundary', async () => {
    const document = '<html><head><title>Grüße 😀</title></head><body>日本語</body></html>';
    const bytes = new TextEncoder().encode(document);

    for (let i = 1; i < bytes.length; i++) {
      const html = await streamHtml([bytes.slice(0, i), bytes.slice(i)]);
      expect(html.replace(/<meta name="(sentry-trace|baggage)"[^/]*\/>/g, '')).toBe(document);
    }
  });
});
