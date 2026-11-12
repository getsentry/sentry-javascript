import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { getCurrentScope, setCurrentClient, spanToJSON, startSpan } from '@sentry/core';
import { NodeClient } from '@sentry/node';
import { afterEach, describe, expect, it } from 'vitest';
import { addServerTimingTraceHeader } from '../../src/server/serverTimingHeader';

function setup(options: { enabled?: boolean } = {}): NodeClient {
  const client = new NodeClient({
    dsn: 'https://public@dsn.ingest.sentry.io/1337',
    tracesSampleRate: 1,
    integrations: [],
    stackParser: () => [],
    transport: () => ({ send: () => Promise.resolve({}), flush: () => Promise.resolve(true) }),
    ...options,
  });
  setCurrentClient(client);
  client.init();
  addServerTimingTraceHeader(client);
  return client;
}

// Without a socket the response buffers what it writes, which is all these tests need.
function createResponse(client: NodeClient, headers: Record<string, string> = {}): ServerResponse {
  const response = new ServerResponse(new IncomingMessage(new Socket()));
  Object.entries(headers).forEach(([name, value]) => response.setHeader(name, value));
  client.emit('httpServerRequest', {}, response, {});
  return response;
}

describe('addServerTimingTraceHeader', () => {
  afterEach(() => {
    getCurrentScope().setClient(undefined);
  });

  it('sends the trace that is active when the headers go out with the first chunk', () => {
    const client = setup();
    const response = createResponse(client, { 'Content-Type': 'text/html; charset=utf-8' });

    const { trace_id: traceId, span_id: spanId } = startSpan({ name: 'GET /page' }, span => {
      response.end('<html></html>');
      return spanToJSON(span);
    });

    expect(response.getHeader('Server-Timing')).toMatch(
      new RegExp(`^sentry-trace;desc="${traceId}-${spanId}-1", baggage;desc="sentry-environment=production,`),
    );
  });

  it('sends the trace when the headers are flushed explicitly', () => {
    const client = setup();
    const response = createResponse(client);

    startSpan({ name: 'GET /page' }, () => response.flushHeaders());

    expect(response.getHeader('Server-Timing')).toMatch(/^sentry-trace;desc="[a-f0-9]{32}-[a-f0-9]{16}-1"/);
  });

  it('keeps an existing Server-Timing header of the app', () => {
    const client = setup();
    const response = createResponse(client, { 'Server-Timing': 'cache;dur=100' });

    response.writeHead(200);

    expect(response.getHeader('Server-Timing')).toMatch(/^cache;dur=100, sentry-trace;desc="/);
  });

  // Headers passed to `writeHead` go straight into the raw header block, not into `getHeader`.
  it('keeps a Server-Timing header passed to writeHead', () => {
    const client = setup();
    const response = createResponse(client);
    const headers = { 'server-timing': 'cache;dur=100' };

    response.writeHead(200, headers);

    expect(headers['server-timing']).toMatch(/^cache;dur=100, sentry-trace;desc="/);
    expect((response as unknown as { _header: string })._header).toContain('cache;dur=100, sentry-trace;desc="');
  });

  it('leaves a Server-Timing header that already carries a sentry-trace entry alone', () => {
    const client = setup();
    const response = createResponse(client, { 'Server-Timing': 'sentry-trace;desc="own"' });

    response.writeHead(200);

    expect(response.getHeader('Server-Timing')).toBe('sentry-trace;desc="own"');
  });

  it.each([
    's-maxage=31536000',
    's-maxage=1, stale-while-revalidate=3599',
    'max-age=0, stale-while-revalidate=60',
    'public, max-age=31536000, immutable',
    'max-age=60',
  ])('sends no trace with a response that a shared cache may store (%s)', cacheControl => {
    const client = setup();
    const response = createResponse(client, { 'Cache-Control': cacheControl });

    response.writeHead(200);

    expect(response.getHeader('Server-Timing')).toBeUndefined();
  });

  it.each(['private, no-cache, no-store, max-age=0, must-revalidate', 'no-store', 'private, max-age=60'])(
    'sends the trace with a response that only the browser may store (%s)',
    cacheControl => {
      const client = setup();
      const response = createResponse(client, { 'Cache-Control': cacheControl });

      response.writeHead(200);

      expect(response.getHeader('Server-Timing')).toMatch(/^sentry-trace;desc="/);
    },
  );

  it('sends no trace with a response that a CDN stores on its own field', () => {
    const client = setup();
    const response = createResponse(client, {
      'Cache-Control': 'private, no-store',
      'Vercel-CDN-Cache-Control': 's-maxage=60',
    });

    response.writeHead(200);

    expect(response.getHeader('Server-Timing')).toBeUndefined();
  });

  it('reads the Cache-Control header passed to writeHead', () => {
    const client = setup();
    const response = createResponse(client);

    response.writeHead(200, { 'Cache-Control': 's-maxage=60' });

    expect(response.getHeader('Server-Timing')).toBeUndefined();
  });

  it.each(['application/json', 'text/x-component', 'image/png'])(
    'sends no trace with a response that is not a document (%s)',
    contentType => {
      const client = setup();
      const response = createResponse(client, { 'Content-Type': contentType });

      response.writeHead(200);

      expect(response.getHeader('Server-Timing')).toBeUndefined();
    },
  );

  it('sends no trace when the SDK is disabled', () => {
    const client = setup({ enabled: false });
    const response = createResponse(client);

    response.writeHead(200);

    expect(response.getHeader('Server-Timing')).toBeUndefined();
  });

  it('ignores a response that is not a Node.js server response', () => {
    const client = setup();

    expect(() => client.emit('httpServerRequest', {}, { end: () => undefined }, {})).not.toThrow();
    expect(() => client.emit('httpServerRequest', {}, undefined, {})).not.toThrow();
  });
});
