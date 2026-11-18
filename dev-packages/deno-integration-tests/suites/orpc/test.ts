// <reference lib="deno.ns" />

import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { os } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

const router = {
  planet: {
    find: os.handler(() => ({ name: 'Earth' })),
  },
};

Deno.test('orpc: included in default integrations', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('ORPC'), `ORPC should be in defaults, got ${names.join(', ')}`);
});

Deno.test('orpc: an oRPC client call continues its trace on the server', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
  });

  const handler = new RPCHandler(router);
  const abortController = new AbortController();
  let onListen: ((_: unknown) => void) | undefined;
  const listening = new Promise(resolve => (onListen = resolve));
  const server = Deno.serve({ port: 0, signal: abortController.signal, onListen }, async request => {
    const { matched, response } = await handler.handle(request, { prefix: '/rpc' });
    return matched ? response : new Response('Not found', { status: 404 });
  });
  await listening;

  try {
    const orpc = createORPCClient<{ planet: { find: (input?: unknown) => Promise<{ name: string }> } }>(
      new RPCLink({ url: `http://localhost:${server.addr.port}/rpc` }),
    );

    const result = await startSpan({ name: 'client', op: 'test' }, () => orpc.planet.find());
    assertEquals(result, { name: 'Earth' });

    await flush();

    const clientSegment = await withTimeout(
      sink.waitFor(span => span.is_segment && span.name === 'client'),
      5_000,
      "'client' segment span",
    );
    const serverSegment = await withTimeout(
      sink.waitFor(span => span.is_segment && span.name === 'orpc.planet/find'),
      5_000,
      "'orpc.planet/find' server segment span",
    );

    const clientSpans = sink.spans.filter(span => span.trace_id === clientSegment.trace_id);
    const procedureCall = clientSpans.find(span => !span.is_segment && span.name === 'orpc.planet/find');
    assertExists(procedureCall, 'expected a client span for the procedure call');
    assertEquals(getSpanOp(procedureCall), 'rpc');
    assertEquals(procedureCall.attributes['sentry.origin']?.value, 'auto.rpc.orpc');

    const httpClientSpan = clientSpans.find(span => getSpanOp(span) === 'http.client');
    assertExists(httpClientSpan, 'expected an http.client span from the fetch integration');

    assertEquals(getSpanOp(serverSegment), 'http.server');
    assertEquals(serverSegment.trace_id, clientSegment.trace_id);
    assertEquals(serverSegment.parent_span_id, httpClientSpan.span_id);
  } finally {
    abortController.abort();
    await server.finished;
  }
});
