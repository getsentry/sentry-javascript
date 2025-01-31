import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Span } from '@sentry/core';
import { getDynamicSamplingContextFromSpan, setCurrentClient, spanIsSampled, spanToJSON } from '@sentry/core';

import { BunClient } from '../../src/client';
import { instrumentBunServe } from '../../src/integrations/bunserver';
import { getDefaultBunClientOptions } from '../helpers';

describe('Bun Serve Integration', () => {
  let client: BunClient;
  // Fun fact: Bun = 2 21 14 :)
  let port: number = 22114;

  beforeAll(() => {
    instrumentBunServe();
  });

  beforeEach(() => {
    const options = getDefaultBunClientOptions({ tracesSampleRate: 1 });
    client = new BunClient(options);
    setCurrentClient(client);
    client.init();
  });

  afterEach(() => {
    // Don't reuse the port; Bun server stops lazily so tests may accidentally hit a server still closing from a
    // previous test
    port += 1;
  });

  test('generates a transaction around a request', async () => {
    let generatedSpan: Span | undefined;

    client.on('spanEnd', span => {
      generatedSpan = span;
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port,
    });
    await fetch(`http://localhost:${port}/`);
    server.stop();

    if (!generatedSpan) {
      throw 'No span was generated in the test';
    }

    expect(spanToJSON(generatedSpan).status).toBe('ok');
    expect(spanToJSON(generatedSpan).data?.['http.response.status_code']).toEqual(200);
    expect(spanToJSON(generatedSpan).op).toEqual('http.server');
    expect(spanToJSON(generatedSpan).description).toEqual('GET /');
  });

  test('generates a post transaction', async () => {
    let generatedSpan: Span | undefined;

    client.on('spanEnd', span => {
      generatedSpan = span;
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port,
    });

    await fetch(`http://localhost:${port}/`, {
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

    client.on('spanEnd', span => {
      generatedSpan = span;
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port,
    });

    await fetch(`http://localhost:${port}/`, {
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

    client.on('spanEnd', span => {
      generatedSpan = span;
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port,
    });

    await fetch(`http://localhost:${port}/`, {
      method: 'OPTIONS',
    });

    await fetch(`http://localhost:${port}/`, {
      method: 'HEAD',
    });

    server.stop();

    expect(generatedSpan).toBeUndefined();
  });

  test('intruments the server again if it is reloaded', async () => {
    let serverWasInstrumented = false;
    client.on('spanEnd', () => {
      serverWasInstrumented = true;
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port,
    });

    server.reload({
      async fetch(_req) {
        return new Response('Reloaded Bun!');
      },
    });

    await fetch(`http://localhost:${port}/`);

    server.stop();

    expect(serverWasInstrumented).toBeTrue();
  });
});
