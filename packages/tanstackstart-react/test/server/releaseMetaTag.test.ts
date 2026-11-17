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
  it('writes the release right after the opening `<head>` tag', async () => {
    const response = await render(
      htmlResponse(['<!DOCTYPE html><html><head><title>Home</title></head><body></body></html>']),
    );

    expect(await response.text()).toBe(
      `<!DOCTYPE html><html><head>${META_TAG}<title>Home</title></head><body></body></html>`,
    );
  });

  it('finds a `<head>` tag split across chunks and with attributes', async () => {
    const response = await render(htmlResponse(['<html><he', 'ad data-x="1">', '<title>Home</title></head>']));

    expect(await response.text()).toBe(`<html><head data-x="1">${META_TAG}<title>Home</title></head>`);
  });

  it('skips `<header>` and keeps multi-byte characters intact', async () => {
    const response = await render(htmlResponse(['<!-- ünïcødé 🚀 --><html><header></header><head></head>']));

    expect(await response.text()).toBe(`<!-- ünïcødé 🚀 --><html><header></header><head>${META_TAG}</head>`);
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

  it('passes a page without `<head>` through unchanged', async () => {
    const html = `<html><body>${'x'.repeat(20 * 1024)}</body></html>`;

    const response = await render(htmlResponse([html.slice(0, 10_000), html.slice(10_000)]));

    expect(await response.text()).toBe(html);
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
