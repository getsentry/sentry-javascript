import type { Span } from '@sentry/core';
import { getDynamicSamplingContextFromSpan, spanIsSampled, spanToJSON } from '@sentry/core';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { NodeClient } from '../../src';
import { init } from '../../src';
import { instrumentBunServe } from '../../src/integrations/bunserver';
import { getDefaultBunClientOptions } from '../helpers';

describe('Bun Serve Integration', () => {
  // Initialize client only once for all tests
  let client: NodeClient | undefined;

  beforeAll(() => {
    instrumentBunServe();
  });

  // Set up client before any tests run
  beforeEach(() => {
    client = init(getDefaultBunClientOptions({ tracesSampleRate: 1 }));
  });

  // Clean up after all tests
  afterAll(() => {
    if (client) {
      client.close();
      client = undefined;
    }
  });

  test('generates a transaction around a request', async () => {
    let generatedSpan: Span | undefined;

    client?.on('spanEnd', span => {
      generatedSpan = span;
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port: 0,
    });
    await fetch(`http://localhost:${server.port}/users?id=123`);
    server.stop();

    if (!generatedSpan) {
      throw 'No span was generated in the test';
    }

    const spanJson = spanToJSON(generatedSpan);
    expect(spanJson.status).toBe('ok');
    expect(spanJson.op).toEqual('http.server');
    expect(spanJson.description).toEqual('GET /users');
    expect(spanJson.data).toEqual({
      'http.query': '?id=123',
      'http.request.method': 'GET',
      'http.response.status_code': 200,
      'sentry.op': 'http.server',
      'sentry.origin': 'auto.http.bun.serve',
      'sentry.sample_rate': 1,
      'sentry.source': 'url',
    });
  });

  test('generates a transaction for routes with a function handler', async () => {
    let generatedSpan: Span | undefined;

    client?.on('spanEnd', span => {
      generatedSpan = span;
    });

    const server = Bun.serve({
      routes: {
        '/users': () => {
          return new Response('Users Route');
        },
      },
      port: 0,
    });
    await fetch(`http://localhost:${server.port}/users`);
    server.stop();

    if (!generatedSpan) {
      throw 'No span was generated in the test';
    }

    const spanJson = spanToJSON(generatedSpan);
    expect(spanJson.status).toBe('ok');
    expect(spanJson.op).toEqual('http.server');
    expect(spanJson.description).toEqual('GET /users');
    expect(spanJson.data).toEqual({
      'http.request.method': 'GET',
      'http.response.status_code': 200,
      'sentry.op': 'http.server',
      'sentry.origin': 'auto.http.bun.serve.route',
      'sentry.sample_rate': 1,
      'sentry.source': 'url',
    });
  });

  test('generates a transaction for routes with HTTP method handlers', async () => {
    let generatedSpan: Span | undefined;

    client?.on('spanEnd', span => {
      generatedSpan = span;
    });

    const server = Bun.serve({
      routes: {
        '/api': {
          GET: () => new Response('GET API'),
          POST: () => new Response('POST API'),
        },
      },
      port: 0,
    });
    await fetch(`http://localhost:${server.port}/api`, { method: 'POST' });
    server.stop();

    if (!generatedSpan) {
      throw 'No span was generated in the test';
    }

    const spanJson = spanToJSON(generatedSpan);
    expect(spanJson.status).toBe('ok');
    expect(spanJson.op).toEqual('http.server');
    expect(spanJson.description).toEqual('POST /api');
    expect(spanJson.data).toEqual({
      'http.request.method': 'POST',
      'http.response.status_code': 200,
      'sentry.op': 'http.server',
      'sentry.origin': 'auto.http.bun.serve.route.method',
      'sentry.sample_rate': 1,
      'sentry.source': 'url',
    });
  });

  test('does not capture Static Response objects in routes', async () => {
    let generatedSpan: Span | undefined;

    client?.on('spanEnd', span => {
      generatedSpan = span;
    });

    const server = Bun.serve({
      routes: {
        '/static': new Response('Static Response'),
      },
      fetch: () => new Response('Default'),
      port: 0,
    });
    await fetch(`http://localhost:${server.port}/static`);
    server.stop();

    // Static responses don't trigger spans
    expect(generatedSpan).toBeUndefined();
  });

  test('generates a post transaction', async () => {
    let generatedSpan: Span | undefined;

    client?.on('spanEnd', span => {
      generatedSpan = span;
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port: 0,
    });

    await fetch(`http://localhost:${server.port}/`, {
      method: 'POST',
    });

    server.stop();

    if (!generatedSpan) {
      throw 'No span was generated in the test';
    }

    expect(spanToJSON(generatedSpan).status).toBe('ok');
    expect(spanToJSON(generatedSpan).data?.['http.response.status_code']).toEqual(200);
    expect(spanToJSON(generatedSpan).op).toEqual('http.server');
    expect(spanToJSON(generatedSpan).description).toEqual('POST /');
  });

  test('continues a trace', async () => {
    const TRACE_ID = '12312012123120121231201212312012';
    const PARENT_SPAN_ID = '1121201211212012';
    const PARENT_SAMPLED = '1';

    const SENTRY_TRACE_HEADER = `${TRACE_ID}-${PARENT_SPAN_ID}-${PARENT_SAMPLED}`;
    const SENTRY_BAGGAGE_HEADER = 'sentry-version=1.0,sentry-sample_rand=0.42,sentry-environment=production';

    let generatedSpan: Span | undefined;

    client?.on('spanEnd', span => {
      generatedSpan = span;
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port: 0,
    });

    await fetch(`http://localhost:${server.port}/`, {
      headers: { 'sentry-trace': SENTRY_TRACE_HEADER, baggage: SENTRY_BAGGAGE_HEADER },
    });

    server.stop();

    if (!generatedSpan) {
      throw 'No span was generated in the test';
    }

    expect(generatedSpan.spanContext().traceId).toBe(TRACE_ID);
    expect(spanToJSON(generatedSpan).parent_span_id).toBe(PARENT_SPAN_ID);
    expect(spanIsSampled(generatedSpan)).toBe(true);
    expect(generatedSpan.isRecording()).toBe(false);

    expect(getDynamicSamplingContextFromSpan(generatedSpan)).toStrictEqual({
      version: '1.0',
      sample_rand: '0.42',
      environment: 'production',
    });
  });

  test('does not create transactions for OPTIONS or HEAD requests', async () => {
    let generatedSpan: Span | undefined;

    client?.on('spanEnd', span => {
      generatedSpan = span;
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port: 0,
    });

    await fetch(`http://localhost:${server.port}/`, {
      method: 'OPTIONS',
    });

    await fetch(`http://localhost:${server.port}/`, {
      method: 'HEAD',
    });

    server.stop();

    expect(generatedSpan).toBeUndefined();
  });

  test('intruments the server again if it is reloaded', async () => {
    let serverWasInstrumented = false;
    client?.on('spanEnd', () => {
      serverWasInstrumented = true;
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port: 0,
    });

    server.reload({
      async fetch(_req) {
        return new Response('Reloaded Bun!');
      },
    });

    await fetch(`http://localhost:${server.port}/`);

    server.stop();

    expect(serverWasInstrumented).toBeTrue();
  });
});
