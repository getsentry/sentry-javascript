import http from 'node:http';
import { getCurrentScope } from '@sentry/core';
import { beforeAll, describe, expect, test } from 'bun:test';
import { init } from '../../src';
import { instrumentBunHttpServer } from '../../src/integrations/bunHttpServer';

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

describe('Bun HTTP Server Integration', () => {
  beforeAll(() => {
    init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 0,
      // Avoid sending anything to Sentry
      transport: () => ({ send: async () => ({}), flush: async () => true }),
    });
    // Only performs isolation + trace reset, no span creation (Next.js emits its own spans).
    instrumentBunHttpServer({ spans: false });
  });

  test('isolates each incoming request with a distinct trace id', async () => {
    const traceIds: string[] = [];

    const { port, close } = await startServer((_req, res) => {
      traceIds.push(getCurrentScope().getPropagationContext().traceId);
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
      observedTraceId = getCurrentScope().getPropagationContext().traceId;
      res.end('ok');
    });

    await fetch(`http://localhost:${port}/`, {
      headers: { 'sentry-trace': `${incomingTraceId}-1234567890abcdef-1` },
    }).then(res => res.text());

    await close();

    expect(observedTraceId).toBe(incomingTraceId);
  });
});
