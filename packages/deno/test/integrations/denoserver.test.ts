import { expect } from 'jsr:@std/expect';
import { getAvailablePort } from 'jsr:@std/net';
import { beforeEach, describe, test } from 'jsr:@std/testing/bdd';

import { type DenoClient, getDynamicSamplingContextFromSpan, spanIsSampled, spanToJSON } from '../../build/index.mjs';
import { getTestClient } from '../client.ts';

describe('Deno Serve Integration', () => {
  let client: DenoClient;

  beforeEach(() => {
    client = getTestClient(() => {});
  });

  test('generates a transaction around a request', async () => {
    client.on('spanEnd', span => {
      const spanJSON = spanToJSON(span);

      expect(spanJSON.status).toBe('ok');
      expect(spanJSON.data?.['http.response.status_code']).toEqual(200);
      expect(spanJSON.op).toEqual('http.server');
      expect(spanJSON.description).toEqual('GET /');
    });

    const port = getAvailablePort();
    const ac = new AbortController();

    Deno.serve({ port, signal: ac.signal, handler: () => new Response('Deno!') }); // using options.handler

    const req = await fetch(`http://localhost:${port}/`);
    await req.text();

    ac.abort();
  });

  test('generates a post transaction', async () => {
    client.on('spanEnd', span => {
      const spanJSON = spanToJSON(span);

      expect(spanJSON.status).toBe('ok');
      expect(spanJSON.data?.['http.response.status_code']).toEqual(200);
      expect(spanJSON.op).toEqual('http.server');
      expect(spanJSON.description).toEqual('POST /');
    });

    const port = getAvailablePort();
    const ac = new AbortController();

    Deno.serve({ port, signal: ac.signal }, () => new Response('Deno!')); // using serve's second argument

    const req = await fetch(`http://localhost:${port}/`, { method: 'POST' });
    await req.text();

    ac.abort();
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

    const port = getAvailablePort();
    const ac = new AbortController();

    Deno.serve({ port, signal: ac.signal }, () => new Response('Deno!'));

    const req = await fetch(`http://localhost:${port}/`, {
      headers: { 'sentry-trace': SENTRY_TRACE_HEADER, baggage: SENTRY_BAGGAGE_HEADER },
    });
    await req.text();

    ac.abort();
  });

  test('does not create transactions for OPTIONS or HEAD requests', async () => {
    client.on('spanEnd', () => {
      // This will never run, but we want to make sure it doesn't run.
      expect(false).toEqual(true);
    });

    const port = getAvailablePort();
    const ac = new AbortController();

    Deno.serve({ port, signal: ac.signal }, () => new Response('Deno!'));

    const req1 = await fetch(`http://localhost:${port}/`, { method: 'OPTIONS' });
    await req1.text();

    const req2 = await fetch(`http://localhost:${port}/`, { method: 'HEAD' });
    await req2.text();

    ac.abort();
  });
});
