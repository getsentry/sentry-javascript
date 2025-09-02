import * as SentryCore from '@sentry/core';
import { afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { instrumentBunServe } from '../../src/integrations/bunserver';

describe('Bun Serve Integration', () => {
  const continueTraceSpy = spyOn(SentryCore, 'continueTrace');
  const startSpanSpy = spyOn(SentryCore, 'startSpan');

  beforeAll(() => {
    instrumentBunServe();
  });

  beforeEach(() => {
    startSpanSpy.mockClear();
    continueTraceSpy.mockClear();
  });

  // Fun fact: Bun = 2 21 14 :)
  let port: number = 22114;

  afterEach(() => {
    // Don't reuse the port; Bun server stops lazily so tests may accidentally hit a server still closing from a
    // previous test
    port += 1;
  });

  test('generates a transaction around a request', async () => {
    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port,
    });
    await fetch(`http://localhost:${port}/users?id=123`);
    await server.stop();

    expect(startSpanSpy).toHaveBeenCalledTimes(1);
    expect(startSpanSpy).toHaveBeenLastCalledWith(
      {
        attributes: {
          'sentry.origin': 'auto.http.bun.serve',
          'http.request.method': 'GET',
          'sentry.source': 'url',
          'url.query': '?id=123',
          'url.path': '/users',
          'url.full': `http://localhost:${port}/users?id=123`,
          'url.port': port.toString(),
          'url.scheme': 'http:',
          'url.domain': 'localhost',
          'http.request.header.accept': '*/*',
          'http.request.header.accept_encoding': 'gzip, deflate, br, zstd',
          'http.request.header.connection': 'keep-alive',
          'http.request.header.host': expect.any(String),
          'http.request.header.user_agent': expect.stringContaining('Bun'),
        },
        op: 'http.server',
        name: 'GET /users',
      },
      expect.any(Function),
    );
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
        attributes: {
          'sentry.origin': 'auto.http.bun.serve',
          'http.request.method': 'POST',
          'sentry.source': 'url',
          'url.path': '/',
          'url.full': `http://localhost:${port}/`,
          'url.port': port.toString(),
          'url.scheme': 'http:',
          'url.domain': 'localhost',
          'http.request.header.accept': '*/*',
          'http.request.header.accept_encoding': 'gzip, deflate, br, zstd',
          'http.request.header.connection': 'keep-alive',
          'http.request.header.content_length': '0',
          'http.request.header.host': expect.any(String),
          'http.request.header.user_agent': expect.stringContaining('Bun'),
        },
        op: 'http.server',
        name: 'POST /',
      },
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
          'sentry.origin': 'auto.http.bun.serve',
          'http.request.method': 'POST',
          'sentry.source': 'url',
          'url.path': '/api/test',
          'url.full': `http://localhost:${port}/api/test`,
          'url.port': port.toString(),
          'url.scheme': 'http:',
          'url.domain': 'localhost',
          // HTTP headers as span attributes following OpenTelemetry semantic conventions
          'http.request.header.user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'http.request.header.content_type': 'application/json',
          'http.request.header.x_custom_header': 'custom-value',
          'http.request.header.accept': 'application/json, text/plain',
          'http.request.header.accept_encoding': 'gzip, deflate, br, zstd',
          'http.request.header.connection': 'keep-alive',
          'http.request.header.content_length': '15',
          'http.request.header.host': expect.any(String),
        }),
        op: 'http.server',
        name: 'POST /api/test',
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
          'sentry.origin': 'auto.http.bun.serve',
          'http.request.method': 'GET',
          'sentry.source': 'route',
          'url.template': '/users/:id',
          'url.path.parameter.id': '123',
          'url.path': '/users/123',
          'url.full': `http://localhost:${port}/users/123`,
          'url.port': port.toString(),
          'url.scheme': 'http:',
          'url.domain': 'localhost',
        }),
        op: 'http.server',
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
          'sentry.origin': 'auto.http.bun.serve',
          'http.request.method': 'GET',
          'sentry.source': 'route',
          'url.template': '/api/*',
          'url.path': '/api/users/123',
          'url.full': `http://localhost:${port}/api/users/123`,
          'url.port': port.toString(),
          'url.scheme': 'http:',
          'url.domain': 'localhost',
        }),
        op: 'http.server',
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
            'sentry.origin': 'auto.http.bun.serve',
            'http.request.method': 'GET',
            'sentry.source': 'route',
            'url.path': '/api/posts',
          }),
          op: 'http.server',
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
            'sentry.origin': 'auto.http.bun.serve',
            'http.request.method': 'POST',
            'sentry.source': 'route',
            'url.path': '/api/posts',
          }),
          op: 'http.server',
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
            'sentry.origin': 'auto.http.bun.serve',
            'http.request.method': 'PUT',
            'sentry.source': 'route',
            'url.path': '/api/posts',
          }),
          op: 'http.server',
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
            'sentry.origin': 'auto.http.bun.serve',
            'http.request.method': 'DELETE',
            'sentry.source': 'route',
            'url.path': '/api/posts',
          }),
          op: 'http.server',
          name: 'DELETE /api/posts',
        }),
        expect.any(Function),
      );

      await server.stop();
    });
  });
});
