import http from 'node:http';
import type { TransactionEvent } from '@sentry/core';
import { getCurrentScope, getIsolationScope, startSpan } from '@sentry/core';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { init } from '../../src';

async function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  const port = await new Promise<number>(resolve => {
    server.listen(0, () => resolve((server.address() as { port: number }).port));
  });
  return {
    port,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

const transactions: TransactionEvent[] = [];

/** Bind on the real completion signal so a "never arrives" regression fails instead of hanging. */
function waitForTransaction(name: string): Promise<TransactionEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for the "${name}" transaction`)), 5000);
    const poll = setInterval(() => {
      const found = transactions.find(event => event.transaction === name);
      if (found) {
        clearTimeout(timer);
        clearInterval(poll);
        resolve(found);
      }
    }, 10);
  });
}

function header(headers: http.IncomingHttpHeaders | undefined, name: string): string | undefined {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

describe('fetchIntegration', () => {
  beforeAll(() => {
    init({
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
      tracesSampleRate: 1.0,
      traceLifecycle: 'static',
      beforeSendTransaction(event) {
        transactions.push(event);
        return null;
      },
      transport: () => ({ send: async () => ({}), flush: async () => true }),
    });
  });

  afterAll(() => {
    getCurrentScope().setClient(undefined);
  });

  test('creates an http.client span and propagates trace headers', async () => {
    let received: http.IncomingHttpHeaders | undefined;
    const { port, close } = await startServer((req, res) => {
      received = req.headers;
      res.end('ok');
    });

    await startSpan({ name: 'parent', op: 'test' }, async () => {
      await fetch(`http://localhost:${port}/downstream`).then(res => res.text());
    });

    const parent = await waitForTransaction('parent');
    await close();

    const clientSpan = parent.spans?.find(span => span.op === 'http.client');
    expect(clientSpan).toBeDefined();
    expect(clientSpan?.origin).toBe('auto.http.fetch');

    const traceId = parent.contexts?.trace?.trace_id;
    const sentryTrace = header(received, 'sentry-trace');
    expect(sentryTrace).toBeDefined();
    expect(sentryTrace!.split('-')[0]).toBe(traceId!);
    expect(sentryTrace!.split('-')[1]).toBe(clientSpan!.span_id!);
    expect(header(received, 'baggage')).toContain(`sentry-trace_id=${traceId}`);
  });

  test('records exactly one fetch breadcrumb', async () => {
    const { port, close } = await startServer((_req, res) => res.end('ok'));
    const url = `http://localhost:${port}/crumb`;

    getIsolationScope().clearBreadcrumbs();
    await fetch(url).then(res => res.text());
    await close();

    const crumbs = getIsolationScope()
      .getScopeData()
      .breadcrumbs.filter(crumb => crumb.category === 'fetch' && crumb.data?.url === url);

    expect(crumbs).toHaveLength(1);
  });
});
