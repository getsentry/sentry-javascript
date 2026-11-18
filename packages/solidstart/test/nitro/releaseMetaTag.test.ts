// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addReleaseMetaTag } from '../../src/nitro/releaseMetaTag';

const META_TAG = '<meta name="sentry-release" content="1.0.0"/>';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

describe('addReleaseMetaTag', () => {
  it('adds the tag right after the opening `<head>` tag of an HTML string', () => {
    const body = addReleaseMetaTag('<html><head lang="en"><title>x</title></head></html>', '1.0.0', 'text/html');

    expect(body).toBe(`<html><head lang="en">${META_TAG}<title>x</title></head></html>`);
  });

  it('escapes the release for the attribute', () => {
    const body = addReleaseMetaTag('<head></head>', '"><script>alert(1)</script>&', 'text/html');

    expect(body).toBe(
      '<head><meta name="sentry-release" content="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;"/></head>',
    );
  });

  it('leaves bodies that are not HTML alone', () => {
    const body = addReleaseMetaTag('{"head":"<head>"}', '1.0.0', 'application/json');

    expect(body).toBe('{"head":"<head>"}');
  });

  it('leaves HTML without a `<head>` tag alone', () => {
    expect(addReleaseMetaTag('<header>x</header>', '1.0.0', 'text/html; charset=utf-8')).toBe('<header>x</header>');
  });

  it('finds a `<head>` tag that is split across stream chunks', async () => {
    const body = addReleaseMetaTag(streamOf('<html><he', 'ad><title>', 'x</title></head>'), '1.0.0', 'text/html');

    await expect(new Response(body as ReadableStream).text()).resolves.toBe(
      `<html><head>${META_TAG}<title>x</title></head>`,
    );
  });

  it('keeps a multi-byte character that is split across stream chunks', async () => {
    const bytes = new TextEncoder().encode('<head>ü</head>');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 7));
        controller.enqueue(bytes.slice(7));
        controller.close();
      },
    });

    const body = addReleaseMetaTag(stream, '1.0.0', 'text/html');

    await expect(new Response(body as ReadableStream).text()).resolves.toBe(`<head>${META_TAG}ü</head>`);
  });

  it('adds the tag to an HTML `Response` and drops its stale `content-length`', async () => {
    const html = '<head></head>';
    const response = new Response(html, {
      status: 201,
      headers: { 'content-type': 'text/html', 'content-length': String(html.length), 'x-custom': 'kept' },
    });

    const result = addReleaseMetaTag(response, '1.0.0', undefined) as Response;

    expect(result.status).toBe(201);
    expect(result.headers.get('x-custom')).toBe('kept');
    expect(result.headers.has('content-length')).toBe(false);
    await expect(result.text()).resolves.toBe(`<head>${META_TAG}</head>`);
  });

  it('leaves an encoded `Response` alone', () => {
    const response = new Response('compressed', {
      headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' },
    });

    expect(addReleaseMetaTag(response, '1.0.0', undefined)).toBe(response);
  });
});
