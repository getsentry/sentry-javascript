import http from 'node:http';
import { getActiveSpan, getCurrentScope, getTraceData, spanToStreamedSpanJSON } from '@sentry/core';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { init } from '../../src';

async function startServer(handler: http.RequestListener): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  const port = await new Promise<number>(resolve => {
    server.listen(0, () => resolve((server.address() as { port: number }).port));
  });
  return {
    port,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

/** Read the trace id the SDK would propagate for the current request. Works in both OTel and non-OTel modes. */
function currentTraceId(): string | undefined {
  return getTraceData()['sentry-trace']?.split('-')[0];
}

describe('Bun HTTP Server Integration', () => {
  beforeAll(() => {
    init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1.0,
      // Avoid propagating the test harness's own trace to the server under test, so the
      // isolation tests below actually test per-request isolation rather than header continuation.
      tracePropagationTargets: [],
      // Avoid sending anything to Sentry
      transport: () => ({ send: async () => ({}), flush: async () => true }),
    });
  });

  afterAll(() => {
    getCurrentScope().setClient(undefined);
  });

  test('creates an http.server span for incoming requests', async () => {
    let span: ReturnType<typeof spanToStreamedSpanJSON> | undefined;

    const { port, close } = await startServer((_req, res) => {
      const activeSpan = getActiveSpan();
      span = activeSpan ? spanToStreamedSpanJSON(activeSpan) : undefined;
      res.end('ok');
    });

    await fetch(`http://localhost:${port}/users?id=123`).then(res => res.text());

    await close();

    expect(span).toBeDefined();
    expect(span?.attributes['sentry.op']).toBe('http.server');
    expect(span?.name).toBe('GET /users');
    expect(span?.attributes['sentry.origin']).toBe('auto.http.server');
  });

  test('isolates each incoming request with a distinct trace id', async () => {
    const traceIds: Array<string | undefined> = [];

    const { port, close } = await startServer((_req, res) => {
      traceIds.push(currentTraceId());
      res.end('ok');
    });

    await fetch(`http://localhost:${port}/a`).then(res => res.text());
    await fetch(`http://localhost:${port}/b`).then(res => res.text());

    await close();

    expect(traceIds).toHaveLength(2);
    expect(traceIds[0]).toEqual(expect.any(String));
    expect(traceIds[1]).toEqual(expect.any(String));
    expect(traceIds[0]).not.toBe(traceIds[1]);
  });

  test('continues an incoming trace from headers', async () => {
    const incomingTraceId = 'cafecafecafecafecafecafecafecafe';
    let observedTraceId: string | undefined;

    const { port, close } = await startServer((_req, res) => {
      observedTraceId = currentTraceId();
      res.end('ok');
    });

    await fetch(`http://localhost:${port}/`, {
      headers: { 'sentry-trace': `${incomingTraceId}-1234567890abcdef-1` },
    }).then(res => res.text());

    await close();

    expect(observedTraceId).toBe(incomingTraceId);
  });
});
