// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { injectClientRelease } from '../../src/server/clientRelease';

const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

type Entry = { module: { default?: unknown; handleError?: unknown } };

async function handle(entry: Entry): Promise<Response> {
  return (entry.module.default as () => Promise<Response>)();
}

function entryReturning(response: Response): Entry {
  return { module: { default: vi.fn(async () => response) } };
}

describe('injectClientRelease', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('adds the release meta tag to the head of HTML documents', async () => {
    const entry = entryReturning(
      new Response('<html><head><title>x</title></head><body></body></html>', {
        status: 201,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': '55', 'X-Custom': 'kept' },
      }),
    );

    injectClientRelease(entry, '1.0.0');
    const response = await handle(entry);

    expect(await response.text()).toBe(
      '<html><head><title>x</title><meta name="sentry-release" content="1.0.0"/></head><body></body></html>',
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('x-custom')).toBe('kept');
    expect(response.headers.has('content-length')).toBe(false);
  });

  it('escapes the release for the attribute', async () => {
    const entry = entryReturning(new Response('<head></head>', { headers: { 'Content-Type': 'text/html' } }));

    injectClientRelease(entry, 'a"b<c>&d');
    const response = await handle(entry);

    expect(await response.text()).toBe('<head><meta name="sentry-release" content="a&quot;b&lt;c&gt;&amp;d"/></head>');
  });

  it('passes the arguments through and keeps the other exports of the entry', async () => {
    const handleError = vi.fn();
    const originalHandle = vi.fn(async () => new Response('<head></head>'));
    const entry: Entry = { module: { default: originalHandle, handleError } };

    injectClientRelease(entry, '1.0.0');
    await (entry.module.default as (...args: unknown[]) => Promise<Response>)('request', 200);

    expect(originalHandle).toHaveBeenCalledWith('request', 200);
    expect(entry.module.handleError).toBe(handleError);
  });

  it.each([
    ['a non-HTML response', new Response('{}', { headers: { 'Content-Type': 'application/json' } })],
    ['an encoded response', new Response('<head></head>', { headers: { 'Content-Encoding': 'gzip' } })],
    ['a response without a body', new Response(null, { status: 204 })],
  ])('leaves %s alone', async (_, original) => {
    const entry = entryReturning(original);

    injectClientRelease(entry, '1.0.0');

    expect(await handle(entry)).toBe(original);
  });

  it('warns when the server build has no request handler', () => {
    const entry: Entry = { module: {} };

    injectClientRelease(entry, '1.0.0');

    expect(entry.module.default).toBeUndefined();
    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('browser events will not have a release'));
  });
});
