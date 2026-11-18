import { describe, expect, it } from 'vitest';
import { addReleaseMetaTag } from '../../src/server/releaseMetaTag';

const META_TAG = '<meta name="sentry-release" content="my-app@1.2.3"/>';

function htmlResponse(chunks: string[], headers: Record<string, string> = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });

  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
}

function render(response: Response, release = 'my-app@1.2.3'): Promise<Response> {
  return addReleaseMetaTag({ fetch: () => response }, release).fetch(new Request('https://example.com/'));
}

describe('addReleaseMetaTag', () => {
  it('writes the release right before the closing `</head>` tag', async () => {
    const response = await render(
      htmlResponse([
        '<!DOCTYPE html><html><head><meta charSet="utf-8"/><title>Home</title></head><body></body></html>',
      ]),
    );

    expect(await response.text()).toBe(
      `<!DOCTYPE html><html><head><meta charSet="utf-8"/><title>Home</title>${META_TAG}</head><body></body></html>`,
    );
  });

  it('finds a `</head>` tag split across chunks', async () => {
    const response = await render(htmlResponse(['<html><head><title>Home</title></he', 'ad><body></body></html>']));

    expect(await response.text()).toBe(`<html><head><title>Home</title>${META_TAG}</head><body></body></html>`);
  });

  it('finds an uppercase `</HEAD>` tag split across many chunks', async () => {
    const response = await render(htmlResponse(['<HTML><HEAD><', '/', 'HE', 'AD><BODY></BODY>']));

    expect(await response.text()).toBe(`<HTML><HEAD>${META_TAG}</HEAD><BODY></BODY>`);
  });

  it('streams the `<head>` content before `</head>` arrives', async () => {
    const encoder = new TextEncoder();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    const response = await render(new Response(body, { headers: { 'content-type': 'text/html' } }));
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    controller.enqueue(encoder.encode('<html><head><title>Home</title></'));
    expect(decoder.decode((await reader.read()).value)).toBe('<html><head><title>Home</title>');

    controller.enqueue(encoder.encode('head><body></body></html>'));
    controller.close();
    let rest = '';
    for (let result = await reader.read(); !result.done; result = await reader.read()) {
      rest += decoder.decode(result.value);
    }
    expect(rest).toBe(`${META_TAG}</head><body></body></html>`);
  });

  it('finds `</head>` after a large `<head>` and keeps multi-byte characters intact', async () => {
    const styles = `<style>${'.a{color:red}'.repeat(5_000)}</style>`;
    const html = `<html><head><title>ünïcødé 🚀</title>${styles}</head><body></body></html>`;
    const encoded = new TextEncoder().encode(html);
    const chunks = [encoded.subarray(0, 21), encoded.subarray(21, 40_000), encoded.subarray(40_000)];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach(chunk => controller.enqueue(chunk));
        controller.close();
      },
    });

    const response = await render(new Response(body, { headers: { 'content-type': 'text/html' } }));

    expect(await response.text()).toBe(html.replace('</head>', `${META_TAG}</head>`));
  });

  it('escapes the release for the attribute', async () => {
    const response = await render(htmlResponse(['<head></head>']), 'a"b<c>&d');

    expect(await response.text()).toBe('<head><meta name="sentry-release" content="a&quot;b&lt;c&gt;&amp;d"/></head>');
  });

  it('drops the `content-length` of the original body and keeps the status and other headers', async () => {
    const original = htmlResponse(['<head></head>'], { 'content-length': '13', 'x-custom': 'value' });

    const response = await render(original);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBeNull();
    expect(response.headers.get('x-custom')).toBe('value');
  });

  it('passes a page without `</head>` through unchanged', async () => {
    const html = `<html><body>${'x'.repeat(20 * 1024)}</body></html>`;

    const response = await render(htmlResponse([html.slice(0, 10_000), html.slice(10_000)]));

    expect(await response.text()).toBe(html);
  });

  it('stops searching for `</head>` after 1 MiB', async () => {
    const prefix = `<html><body>${'x'.repeat(1024 * 1024)}`;

    const response = await render(htmlResponse([prefix, '</head></body></html>']));

    expect(await response.text()).toBe(`${prefix}</head></body></html>`);
  });

  it.each([
    { label: 'non-HTML responses', response: () => Response.json({ head: '<head>' }) },
    {
      label: 'compressed HTML responses',
      response: () => htmlResponse(['<head></head>'], { 'content-encoding': 'gzip' }),
    },
    {
      label: 'HTML responses without a body',
      response: () => new Response(null, { status: 304, headers: { 'content-type': 'text/html' } }),
    },
  ])('returns $label as they are', async ({ response }) => {
    const original = response();

    expect(await render(original)).toBe(original);
  });

  it('keeps the other properties of the server entry', () => {
    const serverEntry = { fetch: () => new Response(), scheduled: () => undefined };

    expect(addReleaseMetaTag(serverEntry, 'my-app@1.2.3').scheduled).toBe(serverEntry.scheduled);
  });
});
