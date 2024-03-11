import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { getDynamicSamplingContextFromSpan, setCurrentClient, spanIsSampled, spanToJSON } from '@sentry/core';

import { BunClient } from '../../src/client';
import { instrumentBunServe } from '../../src/integrations/bunserver';
import { getDefaultBunClientOptions } from '../helpers';

// Fun fact: Bun = 2 21 14 :)
const DEFAULT_PORT = 22114;

describe('Bun Serve Integration', () => {
  let client: BunClient;

  beforeAll(() => {
    instrumentBunServe();
  });

  beforeEach(() => {
    const options = getDefaultBunClientOptions({ tracesSampleRate: 1, debug: true });
    client = new BunClient(options);
    setCurrentClient(client);
    client.init();
  });

  test('generates a transaction around a request', async () => {
    client.on('spanEnd', span => {
      expect(spanToJSON(span).status).toBe('ok');
      expect(spanToJSON(span).data?.['http.response.status_code']).toEqual(200);
      expect(spanToJSON(span).op).toEqual('http.server');
      expect(spanToJSON(span).description).toEqual('GET /');
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port: DEFAULT_PORT,
    });

    await fetch('http://localhost:22114/');

    server.stop();
  });

  test('generates a post transaction', async () => {
    client.on('spanEnd', span => {
      expect(spanToJSON(span).status).toBe('ok');
      expect(spanToJSON(span).data?.['http.response.status_code']).toEqual(200);
      expect(spanToJSON(span).op).toEqual('http.server');
      expect(spanToJSON(span).description).toEqual('POST /');
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port: DEFAULT_PORT,
    });

    await fetch('http://localhost:22114/', {
      method: 'POST',
    });

    server.stop();
  });

  test('continues a trace', async () => {
    const TRACE_ID = '12312012123120121231201212312012';
    const PARENT_SPAN_ID = '1121201211212012';
    const PARENT_SAMPLED = '1';

    const SENTRY_TRACE_HEADER = `${TRACE_ID}-${PARENT_SPAN_ID}-${PARENT_SAMPLED}`;
    const SENTRY_BAGGAGE_HEADER = 'sentry-version=1.0,sentry-environment=production';

    client.on('spanEnd', span => {
      expect(span.spanContext().traceId).toBe(TRACE_ID);
      expect(spanToJSON(span).parent_span_id).toBe(PARENT_SPAN_ID);
      expect(spanIsSampled(span)).toBe(true);
      expect(span.isRecording()).toBe(false);

      expect(getDynamicSamplingContextFromSpan(span)).toStrictEqual({
        version: '1.0',
        environment: 'production',
      });
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port: DEFAULT_PORT,
    });

    await fetch('http://localhost:22114/', {
      headers: { 'sentry-trace': SENTRY_TRACE_HEADER, baggage: SENTRY_BAGGAGE_HEADER },
    });

    server.stop();
  });

  test('does not create transactions for OPTIONS or HEAD requests', async () => {
    client.on('spanEnd', () => {
      // This will never run, but we want to make sure it doesn't run.
      expect(false).toEqual(true);
    });

    const server = Bun.serve({
      async fetch(_req) {
        return new Response('Bun!');
      },
      port: DEFAULT_PORT,
    });

    await fetch('http://localhost:22114/', {
      method: 'OPTIONS',
    });

    await fetch('http://localhost:22114/', {
      method: 'HEAD',
    });

    server.stop();
  });
});
