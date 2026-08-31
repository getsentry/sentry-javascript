import { describe, expect, it, vi } from 'vitest';
import { injectHtmlIntoHead, injectHtmlIntoHeadStream } from '../../src/utils/htmlInjection';

const META_TAGS =
  '<meta name="sentry-trace" content="abc123-def456-1"/><meta name="baggage" content="sentry-trace_id=abc123"/>';

function streamOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

function inject(chunks: (string | Uint8Array)[], html: string = META_TAGS): Promise<string> {
  return new Response(injectHtmlIntoHeadStream(streamOf(chunks), html)).text();
}

function countTraceMetaTags(html: string): number {
  return html.split('name="sentry-trace"').length - 1;
}

describe('injectHtmlIntoHeadStream', () => {
  it('injects directly before the closing head tag', async () => {
    const html = await inject(['<html><head><title>t</title></head><body>b</body></html>']);

    expect(countTraceMetaTags(html)).toBe(1);
    // No whitespace text node may appear between the injected tags or before `</head>` —
    // React 19 whole-document hydration rejects unexpected text nodes in `<head>` (#21915).
    expect(html).toContain(`<title>t</title>${META_TAGS}</head>`);
  });

  it('injects when the closing head tag is split across chunks', async () => {
    const html = await inject(['<html><head><title>t</title></he', 'ad><body>b</body></html>']);

    expect(countTraceMetaTags(html)).toBe(1);
    expect(html).toContain(`${META_TAGS}</head>`);
  });

  it('produces the same output wherever the response is split', async () => {
    const document =
      '<!DOCTYPE html><html lang="en" data-x="a&quot;b"><head><meta charSet="utf-8"/><title>App</title></head><body><div id="root">hi</div></body></html>';

    const unsplit = await inject([document]);
    expect(countTraceMetaTags(unsplit)).toBe(1);

    for (let i = 1; i < document.length; i++) {
      expect(await inject([document.slice(0, i), document.slice(i)])).toBe(unsplit);
    }

    expect(await inject([...document])).toBe(unsplit);
  });

  it('does not inject when the head already carries trace meta tags', async () => {
    const document = '<html><head><meta name="sentry-trace" content="existing"/></head><body>b</body></html>';

    expect(await inject([document])).toBe(document);
    expect(await inject([...document])).toBe(document);
  });

  it('injects when sentry-trace appears in the body rather than the head', async () => {
    const html = await inject(['<html><head><title>t</title></head><body>"sentry-trace"</body></html>']);

    expect(countTraceMetaTags(html)).toBe(1);
    expect(html).toContain(`${META_TAGS}</head>`);
  });

  it('keeps multi-byte characters intact when they straddle a chunk boundary', async () => {
    const document = '<html><head><title>Grüße 😀</title></head><body>日本語</body></html>';
    const bytes = new TextEncoder().encode(document);

    for (let i = 1; i < bytes.length; i++) {
      const html = await inject([bytes.slice(0, i), bytes.slice(i)]);
      expect(html.replace(META_TAGS, '')).toBe(document);
    }
  });

  it('emits the body unchanged when it has no closing head tag', async () => {
    const document = '<html><body><p>fragment</p></body></html>';

    expect(await inject([document])).toBe(document);
    expect(await inject([...document])).toBe(document);
  });

  it('emits the body unchanged when there is nothing to inject', async () => {
    const document = '<html><head><title>t</title></head><body>b</body></html>';

    expect(await inject([document], '')).toBe(document);
  });

  // A framework's own SSR stream can pause while its `desiredSize` is at or below zero.
  // Draining it regardless lets its bounded internal buffers overflow.
  it('does not read the body until the result is consumed', async () => {
    const encoder = new TextEncoder();
    let pulled = 0;

    const body = new ReadableStream({
      pull(controller) {
        pulled++;
        controller.enqueue(encoder.encode(`<p>${pulled}</p>`));
      },
    });

    injectHtmlIntoHeadStream(body, META_TAGS);

    for (let i = 0; i < 50; i++) {
      await Promise.resolve();
    }

    expect(pulled).toBeLessThan(10);
  });

  it('reports a failing body to onError', async () => {
    const bodyError = new Error('stream read error');
    const onError = vi.fn();

    const body = new ReadableStream({
      start(controller) {
        controller.error(bodyError);
      },
    });

    await expect(new Response(injectHtmlIntoHeadStream(body, META_TAGS, onError)).text()).rejects.toThrow();

    expect(onError).toHaveBeenCalledWith(bodyError);
  });

  // A user navigating away cancels the response; that must not surface as an error, and it
  // must stop the body being rendered.
  it('cancels the body without reporting when the consumer goes away', async () => {
    const encoder = new TextEncoder();
    const onError = vi.fn();
    const cancelled = vi.fn();

    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(encoder.encode('<p>chunk</p>'));
      },
      cancel: cancelled,
    });

    const reader = injectHtmlIntoHeadStream(body, META_TAGS, onError).getReader();
    await reader.read();
    await reader.cancel('navigated away');

    // Cancellation reaches the body asynchronously; a later read on a fresh stream is not
    // available here, so poll the sentinel spy directly.
    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledWith('navigated away'));
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('injectHtmlIntoHead', () => {
  it('injects into HTML responses and preserves status and headers', async () => {
    const response = new Response('<html><head></head><body>b</body></html>', {
      status: 201,
      statusText: 'Created',
      headers: new Headers({ 'content-type': 'text/html; charset=utf-8', 'X-Custom-Header': 'custom-value' }),
    });

    const injected = injectHtmlIntoHead(response, META_TAGS);
    const html = await injected.text();

    expect(html).toContain(`${META_TAGS}</head>`);
    expect(injected.status).toBe(201);
    expect(injected.statusText).toBe('Created');
    expect(injected.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(injected.headers.get('X-Custom-Header')).toBe('custom-value');
  });

  it('drops a stale content-length, since the body grows', async () => {
    const html = '<html><head></head><body>b</body></html>';
    const response = new Response(html, {
      headers: new Headers({ 'content-type': 'text/html', 'content-length': String(html.length) }),
    });

    const injected = injectHtmlIntoHead(response, META_TAGS);

    expect(injected.headers.get('content-length')).toBeNull();
    expect((await injected.text()).length).toBe(html.length + META_TAGS.length);
  });

  it('returns non-HTML responses untouched', async () => {
    const response = new Response('{"data":"value"}', {
      headers: new Headers({ 'content-type': 'application/json' }),
    });

    const injected = injectHtmlIntoHead(response, META_TAGS);

    expect(injected).toBe(response);
    expect(await injected.text()).toBe('{"data":"value"}');
  });

  it('returns responses untouched when there is nothing to inject', () => {
    const response = new Response('<html><head></head></html>', {
      headers: new Headers({ 'content-type': 'text/html' }),
    });

    expect(injectHtmlIntoHead(response, '')).toBe(response);
  });

  it('returns responses without a body untouched', () => {
    const response = new Response(null, {
      status: 204,
      headers: new Headers({ 'content-type': 'text/html' }),
    });

    expect(injectHtmlIntoHead(response, META_TAGS)).toBe(response);
  });
});
