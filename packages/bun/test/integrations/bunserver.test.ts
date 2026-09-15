import type { RequestEventData } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { BunOptions } from '../../src';
import { bunServerIntegration, getDefaultIntegrationsWithoutPerformance, init } from '../../src';
import { instrumentBunServe } from '../../src/integrations/bunserver';

describe('Bun Serve Integration', () => {
  const mockSpan = SentryCore.startInactiveSpan({ name: 'test span' });
  const setAttributesSpy = spyOn(mockSpan, 'setAttributes');
  const continueTraceSpy = spyOn(SentryCore, 'continueTrace');
  const startSpanSpy = spyOn(SentryCore, 'startSpan').mockImplementation((_opts, cb) => {
    return cb(mockSpan as unknown as SentryCore.Span);
  });

  const setupClient = (options?: BunOptions): void => {
    init({
      dsn: 'https://username@domain/123',
      defaultIntegrations: false,
      ...options,
      transport: () =>
        SentryCore.createTransport({ recordDroppedEvent: () => undefined }, () => SentryCore.resolvedSyncPromise({})),
    });
  };

  beforeAll(() => {
    instrumentBunServe();
  });

  beforeEach(() => {
    startSpanSpy.mockClear();
    continueTraceSpy.mockClear();
    setAttributesSpy.mockClear();
    // Header attributes are only collected while a client is active, so every test sets up its own instead of
    // relying on one leaking in from whichever test file `bun test` happened to run first.
    setupClient();
  });

  // Fun fact: Bun = 2 21 14 :)
  let port: number = 22114;

  afterEach(() => {
    SentryCore.getCurrentScope().setClient(undefined);
    // Don't reuse the port; Bun server stops lazily so tests may accidentally hit a server still closing from a
    // previous test
    port += 1;
  });

  test('generates a transaction around a request', async () => {
    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!', { headers: new Headers({ 'x-custom': 'value' }) });
      },
      port,
    });
    await fetch(`http://localhost:${port}/users?id=123`);
    await server.stop();

    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenLastCalledWith(
      {
        attributes: expect.objectContaining({
          'sentry.op': 'http.server',
          'sentry.origin': 'auto.http.bun.serve',
          'http.request.method': 'GET',
          'sentry.segment.name.source': 'url',
          'url.query': 'id=123',
          'url.path': '/users',
          'url.full': `http://localhost:${port}/users?id=123`,
          'url.port': port.toString(),
          'url.scheme': 'http:',
          'url.domain': 'localhost',
          'http.request.header.accept': '*/*',
          'http.request.header.accept-encoding': 'gzip, deflate, br, zstd',
          'http.request.header.connection': 'keep-alive',
          'http.request.header.host': expect.any(String),
          'http.request.header.user-agent': expect.stringContaining('Bun'),
        }),
        name: 'GET',
      },
      expect.any(Function),
    );

    expect(setAttributesSpy).toHaveBeenCalledWith({
      'http.response.header.x-custom': 'value',
    });
  });

  test('generates a post transaction', async () => {
    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port,
    });

    await fetch(`http://localhost:${port}/`, {
      method: 'POST',
    });

    await server.stop();

    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenLastCalledWith(
      {
        attributes: expect.objectContaining({
          'sentry.op': 'http.server',
          'sentry.origin': 'auto.http.bun.serve',
          'http.request.method': 'POST',
          'sentry.segment.name.source': 'url',
          'url.path': '/',
          'url.full': `http://localhost:${port}/`,
          'url.port': port.toString(),
          'url.scheme': 'http:',
          'url.domain': 'localhost',
          'http.request.header.accept': '*/*',
          'http.request.header.accept-encoding': 'gzip, deflate, br, zstd',
          'http.request.header.connection': 'keep-alive',
          'http.request.header.content-length': '0',
          'http.request.header.host': expect.any(String),
          'http.request.header.user-agent': expect.stringContaining('Bun'),
        }),
        name: 'POST',
      },
      expect.any(Function),
    );
  });

  test('generates a QUERY transaction with a request body', async () => {
    const server = Bun.serve({
      async fetch(req) {
        return new Response(await req.text());
      },
      port,
    });

    const response = await fetch(`http://localhost:${port}/search`, {
      method: 'QUERY',
      body: JSON.stringify({ query: 'bun' }),
    });
    expect(await response.json()).toEqual({ query: 'bun' });

    await server.stop();

    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'sentry.op': 'http.server',
          'http.request.method': 'QUERY',
        }),
        name: 'QUERY',
      }),
      expect.any(Function),
    );
  });

  test('continues a trace', async () => {
    const TRACE_ID = '12312012123120121231201212312012';
    const PARENT_SPAN_ID = '1121201211212012';
    const PARENT_SAMPLED = '1';

    const SENTRY_TRACE_HEADER = `${TRACE_ID}-${PARENT_SPAN_ID}-${PARENT_SAMPLED}`;
    const SENTRY_BAGGAGE_HEADER = 'sentry-sample_rand=0.42,sentry-environment=production';

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port,
    });

    // Make request with trace headers
    await fetch(`http://localhost:${port}/`, {
      headers: {
        'sentry-trace': SENTRY_TRACE_HEADER,
        baggage: SENTRY_BAGGAGE_HEADER,
      },
    });

    await server.stop();

    // Verify continueTrace was called with the correct headers
    expect(continueTraceSpy).toHaveBeenCalledTimes(1);
    expect(continueTraceSpy).toHaveBeenCalledWith(
      {
        sentryTrace: SENTRY_TRACE_HEADER,
        baggage: SENTRY_BAGGAGE_HEADER,
      },
      expect.any(Function),
    );

    // Verify a span was created
    expect(startSpanSpy).toHaveBeenCalledTimes(1);
  });

  test('includes HTTP request headers as span attributes', async () => {
    setupClient({ defaultIntegrations: getDefaultIntegrationsWithoutPerformance() });
    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Headers test!');
      },
      port,
    });

    // Make request with custom headers
    await fetch(`http://localhost:${port}/api/test`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value',
        Accept: 'application/json, text/plain',
        Authorization: 'Bearer token123',
      },
      body: JSON.stringify({ test: 'data' }),
    });

    await server.stop();

    // Verify span was created with header attributes
    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'sentry.op': 'http.server',
          'sentry.origin': 'auto.http.bun.serve',
          'http.request.method': 'POST',
          'sentry.segment.name.source': 'url',
          'url.path': '/api/test',
          'url.full': `http://localhost:${port}/api/test`,
          'url.port': port.toString(),
          'url.scheme': 'http:',
          'url.domain': 'localhost',
          // HTTP headers as span attributes following OpenTelemetry semantic conventions
          'http.request.header.user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'http.request.header.content-type': 'application/json',
          'http.request.header.x-custom-header': 'custom-value',
          'http.request.header.accept': 'application/json, text/plain',
          'http.request.header.accept-encoding': 'gzip, deflate, br, zstd',
          'http.request.header.connection': 'keep-alive',
          'http.request.header.content-length': '15',
          'http.request.header.host': expect.any(String),
          'http.request.header.baggage': expect.any(String),
          'http.request.header.sentry-trace': expect.any(String),
        }),
        name: 'POST',
      }),
      expect.any(Function),
    );
  });

  test('skips span creation for OPTIONS and HEAD requests', async () => {
    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port,
    });

    // Make OPTIONS request
    const optionsResponse = await fetch(`http://localhost:${port}/`, {
      method: 'OPTIONS',
    });
    expect(await optionsResponse.text()).toBe('Bun!');

    // Make HEAD request
    const headResponse = await fetch(`http://localhost:${port}/`, {
      method: 'HEAD',
    });
    expect(await headResponse.text()).toBe('');

    // Verify no spans were created
    expect(startSpanSpy).not.toHaveBeenCalled();

    // Make a GET request to verify spans are still created for other methods
    const getResponse = await fetch(`http://localhost:${port}/`);
    expect(await getResponse.text()).toBe('Bun!');
    expect(startSpanSpy).toHaveBeenCalledTimes(1);

    await server.stop();
  });

  test('handles route parameters correctly', async () => {
    const server = Bun.serve({
      routes: {
        '/users/:id': req => {
          return new Response(`User ${req.params.id}`);
        },
      },
      port,
    });

    // Make request to parameterized route
    const response = await fetch(`http://localhost:${port}/users/123`);
    expect(await response.text()).toBe('User 123');

    // Verify span was created with correct attributes
    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'sentry.op': 'http.server',
          'sentry.origin': 'auto.http.bun.serve',
          'http.request.method': 'GET',
          'sentry.segment.name.source': 'route',
          'url.template': '/users/:id',
          'url.path.parameter.id': '123',
          'url.path': '/users/123',
          'url.full': `http://localhost:${port}/users/123`,
          'url.port': port.toString(),
          'url.scheme': 'http:',
          'url.domain': 'localhost',
        }),
        name: 'GET /users/:id',
      }),
      expect.any(Function),
    );

    await server.stop();
  });

  test('handles wildcard routes correctly', async () => {
    const server = Bun.serve({
      routes: {
        '/api/*': req => {
          return new Response(`API route: ${req.url}`);
        },
      },
      port,
    });

    // Make request to wildcard route
    const response = await fetch(`http://localhost:${port}/api/users/123`);
    expect(await response.text()).toBe(`API route: http://localhost:${port}/api/users/123`);

    // Verify span was created with correct attributes
    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'sentry.op': 'http.server',
          'sentry.origin': 'auto.http.bun.serve',
          'http.request.method': 'GET',
          'sentry.segment.name.source': 'route',
          'url.template': '/api/*',
          'url.path': '/api/users/123',
          'url.full': `http://localhost:${port}/api/users/123`,
          'url.port': port.toString(),
          'url.scheme': 'http:',
          'url.domain': 'localhost',
        }),
        name: 'GET /api/*',
      }),
      expect.any(Function),
    );

    await server.stop();
  });

  test('reapplies instrumentation after server reload', async () => {
    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Initial handler');
      },
      port,
    });

    // Verify initial handler works
    const initialResponse = await fetch(`http://localhost:${port}/`);
    expect(await initialResponse.text()).toBe('Initial handler');
    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    startSpanSpy.mockClear();

    // Reload server with new handler
    server.reload({
      async fetch(_req) {
        return new Response('Reloaded handler');
      },
    });

    // Verify new handler works and is instrumented
    const reloadedResponse = await fetch(`http://localhost:${port}/`);
    expect(await reloadedResponse.text()).toBe('Reloaded handler');
    expect(startSpanSpy).toHaveBeenCalledTimes(1);

    await server.stop();
  });

  describe('per-HTTP method routes', () => {
    test('handles GET method correctly', async () => {
      const server = Bun.serve({
        routes: {
          '/api/posts': {
            GET: () => new Response('List posts'),
          },
        },
        port,
      });

      const response = await fetch(`http://localhost:${port}/api/posts`);
      expect(await response.text()).toBe('List posts');
      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.bun.serve',
            'http.request.method': 'GET',
            'sentry.segment.name.source': 'route',
            'url.path': '/api/posts',
          }),
          name: 'GET /api/posts',
        }),
        expect.any(Function),
      );

      await server.stop();
    });

    test('handles POST method correctly', async () => {
      const server = Bun.serve({
        routes: {
          '/api/posts': {
            POST: async req => {
              const body = (await req.json()) as Record<string, unknown>;
              return Response.json({ created: true, ...body });
            },
          },
        },
        port,
      });

      const response = await fetch(`http://localhost:${port}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Post' }),
      });
      expect(await response.json()).toEqual({ created: true, title: 'New Post' });
      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.bun.serve',
            'http.request.method': 'POST',
            'sentry.segment.name.source': 'route',
            'url.path': '/api/posts',
          }),
          name: 'POST /api/posts',
        }),
        expect.any(Function),
      );

      await server.stop();
    });

    test('handles PUT method correctly', async () => {
      const server = Bun.serve({
        routes: {
          '/api/posts': {
            PUT: () => new Response('Update post'),
          },
        },
        port,
      });

      const response = await fetch(`http://localhost:${port}/api/posts`, {
        method: 'PUT',
      });
      expect(await response.text()).toBe('Update post');
      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.bun.serve',
            'http.request.method': 'PUT',
            'sentry.segment.name.source': 'route',
            'url.path': '/api/posts',
          }),
          name: 'PUT /api/posts',
        }),
        expect.any(Function),
      );

      await server.stop();
    });

    test('handles DELETE method correctly', async () => {
      const server = Bun.serve({
        routes: {
          '/api/posts': {
            DELETE: () => new Response('Delete post'),
          },
        },
        port,
      });

      const response = await fetch(`http://localhost:${port}/api/posts`, {
        method: 'DELETE',
      });
      expect(await response.text()).toBe('Delete post');
      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      expect(startSpanSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          attributes: expect.objectContaining({
            'sentry.op': 'http.server',
            'sentry.origin': 'auto.http.bun.serve',
            'http.request.method': 'DELETE',
            'sentry.segment.name.source': 'route',
            'url.path': '/api/posts',
          }),
          name: 'DELETE /api/posts',
        }),
        expect.any(Function),
      );

      await server.stop();
    });
  });

  describe('data collection', () => {
    test('keeps PII request headers when dataCollection enables full header collection', async () => {
      setupClient({ dataCollection: { httpHeaders: { request: true, response: true } } });

      const server = Bun.serve({
        async fetch(_req) {
          return new Response('Bun!');
        },
        port,
      });

      await fetch(`http://localhost:${port}/`, {
        headers: { 'X-Forwarded-For': '203.0.113.7' },
      });

      await server.stop();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      const attributes = startSpanSpy.mock.calls[0]?.[0]?.attributes;
      expect(attributes?.['http.request.header.x-forwarded-for']).toBe('203.0.113.7');
    });

    test('filters request headers according to the dataCollection deny list', async () => {
      // Deny a header that is not part of the built-in sensitive snippets, so the assertion proves
      // the deny list is applied (the header would otherwise be collected by default).
      setupClient({ dataCollection: { httpHeaders: { request: { deny: ['x-internal'] } } } });

      const server = Bun.serve({
        async fetch(_req) {
          return new Response('Bun!');
        },
        port,
      });

      await fetch(`http://localhost:${port}/`, {
        headers: { 'X-Internal': 'internal-value', 'X-Public': 'public-value' },
      });

      await server.stop();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      const attributes = startSpanSpy.mock.calls[0]?.[0]?.attributes;
      expect(attributes?.['http.request.header.x-internal']).toBe('[Filtered]');
      expect(attributes?.['http.request.header.x-public']).toBe('public-value');
    });

    test('filters always-sensitive request headers even when collection is permissive', async () => {
      setupClient({ dataCollection: { httpHeaders: { request: true } } });

      const server = Bun.serve({
        async fetch(_req) {
          return new Response('Bun!');
        },
        port,
      });

      await fetch(`http://localhost:${port}/`, {
        headers: { Authorization: 'Bearer supersecret-token' },
      });

      await server.stop();

      expect(startSpanSpy).toHaveBeenCalledTimes(1);
      const attributes = startSpanSpy.mock.calls[0]?.[0]?.attributes;
      expect(attributes?.['http.request.header.authorization']).toBe('[Filtered]');
    });

    test('applies the dataCollection response header collection behavior', async () => {
      setupClient({ dataCollection: { httpHeaders: { response: { deny: ['x-internal'] } } } });

      const server = Bun.serve({
        async fetch(_req) {
          return new Response('Bun!', {
            headers: new Headers({ 'x-internal': 'internal-value', 'x-public': 'public-value' }),
          });
        },
        port,
      });

      await fetch(`http://localhost:${port}/`);

      await server.stop();

      expect(setAttributesSpy).toHaveBeenCalledTimes(1);
      const responseAttributes = setAttributesSpy.mock.calls[0]?.[0];
      expect(responseAttributes?.['http.response.header.x-internal']).toBe('[Filtered]');
      expect(responseAttributes?.['http.response.header.x-public']).toBe('public-value');
    });
  });

  describe('request bodies', () => {
    const captureBodySpy = spyOn(SentryCore, 'captureBodyFromWinterCGRequest');

    beforeEach(() => {
      captureBodySpy.mockClear();
    });

    // Serves one request and returns the `normalizedRequest` the handler saw on its isolation scope. The body is
    // read after the SDK has had its turn, so this also proves capturing does not consume it.
    async function serveAndCapture(path: string, requestInit: RequestInit): Promise<RequestEventData | undefined> {
      let normalizedRequest: RequestEventData | undefined;
      const server = Bun.serve({
        async fetch(req) {
          normalizedRequest = SentryCore.getIsolationScope().getScopeData().sdkProcessingMetadata.normalizedRequest;
          return new Response(await req.text());
        },
        port,
      });

      const response = await fetch(`http://localhost:${port}${path}`, requestInit);
      expect(await response.text()).toBe(typeof requestInit.body === 'string' ? requestInit.body : '');

      await server.stop();
      return normalizedRequest;
    }

    test('normalizes the request like the other WinterCG runtimes', async () => {
      const normalizedRequest = await serveAndCapture('/users?id=123&sort=asc', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'X-Custom-Header': 'custom-value' },
        body: 'hello',
      });

      expect(normalizedRequest).toEqual({
        method: 'POST',
        url: `http://localhost:${port}/users?id=123&sort=asc`,
        // No leading `?`, matching `winterCGRequestToRequestData` on Deno and Cloudflare
        query_string: 'id=123&sort=asc',
        headers: expect.objectContaining({
          'content-type': 'text/plain',
          'x-custom-header': 'custom-value',
          'content-length': '5',
        }),
        data: 'hello',
      });
    });

    test('captures incoming request bodies by default', async () => {
      const body = JSON.stringify({ username: 'test', action: 'login' });
      const normalizedRequest = await serveAndCapture('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      expect(captureBodySpy).toHaveBeenCalledTimes(1);
      expect(captureBodySpy).toHaveBeenCalledWith(expect.any(Request), expect.any(SentryCore.Scope), 'medium');
      expect(normalizedRequest?.data).toBe(body);
    });

    test('captures bodies on route handlers', async () => {
      let normalizedRequest: RequestEventData | undefined;
      const server = Bun.serve({
        routes: {
          '/api/posts': {
            POST: async req => {
              normalizedRequest = SentryCore.getIsolationScope().getScopeData().sdkProcessingMetadata.normalizedRequest;
              return new Response(await req.text());
            },
          },
        },
        port,
      });

      const response = await fetch(`http://localhost:${port}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"title":"New Post"}',
      });
      expect(await response.text()).toBe('{"title":"New Post"}');
      await server.stop();

      expect(normalizedRequest?.data).toBe('{"title":"New Post"}');
    });

    test('does not read bodies of GET requests', async () => {
      const normalizedRequest = await serveAndCapture('/users', { method: 'GET' });

      expect(captureBodySpy).not.toHaveBeenCalled();
      expect(normalizedRequest?.method).toBe('GET');
      expect(normalizedRequest?.data).toBeUndefined();
    });

    test('truncates bodies larger than the default medium size', async () => {
      const body = 'a'.repeat(10_001);
      const normalizedRequest = await serveAndCapture('/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body,
      });

      expect(normalizedRequest?.data).toBe(`${'a'.repeat(9_997)}...`);
    });

    test('does not capture bodies when dataCollection.httpBodies excludes incoming requests', async () => {
      setupClient({ dataCollection: { httpBodies: [] } });

      const normalizedRequest = await serveAndCapture('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"secret":"do-not-capture"}',
      });

      expect(captureBodySpy).not.toHaveBeenCalled();
      expect(normalizedRequest?.data).toBeUndefined();
    });

    test('an explicit maxRequestBodySize overrides disabled body collection', async () => {
      setupClient({
        dataCollection: { httpBodies: [] },
        integrations: [bunServerIntegration({ maxRequestBodySize: 'small' })],
      });

      const normalizedRequest = await serveAndCapture('/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'a'.repeat(1_001),
      });

      expect(captureBodySpy).toHaveBeenCalledWith(expect.any(Request), expect.any(SentryCore.Scope), 'small');
      expect(normalizedRequest?.data).toBe(`${'a'.repeat(997)}...`);
    });

    test('an explicit none overrides enabled body collection', async () => {
      setupClient({
        dataCollection: { httpBodies: ['incomingRequest'] },
        integrations: [bunServerIntegration({ maxRequestBodySize: 'none' })],
      });

      const normalizedRequest = await serveAndCapture('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'do-not-capture',
      });

      expect(captureBodySpy).not.toHaveBeenCalled();
      expect(normalizedRequest?.data).toBeUndefined();
    });

    test('always captures bodies beyond the medium size', async () => {
      setupClient({ integrations: [bunServerIntegration({ maxRequestBodySize: 'always' })] });

      const body = 'a'.repeat(20_000);
      const normalizedRequest = await serveAndCapture('/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body,
      });

      expect(captureBodySpy).toHaveBeenCalledWith(expect.any(Request), expect.any(SentryCore.Scope), 'always');
      expect(normalizedRequest?.data).toBe(body);
    });

    test('skips non-textual bodies', async () => {
      const normalizedRequest = await serveAndCapture('/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: 'binary-ish',
      });

      expect(normalizedRequest?.data).toBeUndefined();
    });
  });
});
