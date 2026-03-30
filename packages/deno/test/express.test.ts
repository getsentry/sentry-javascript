// <reference lib="deno.ns" />
// @ts-types="npm:@types/express@4.17.21"

import type { ErrorEvent, TransactionEvent } from '@sentry/core';
import * as Sentry from '../build/esm/index.js';
import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.212.0/assert/mod.ts';

const PORT = Number(process.env.PORT || 15443);

// express only works on deno using node:http, and we have to manually
// start a span in order to get it to create child spans for routes.
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import * as express from 'express';

const transactionEvents: TransactionEvent[] = [];
const errorEvents: ErrorEvent[] = [];

Sentry.init({
  dsn: 'https://username@domain/123',
  tracesSampleRate: 1,
  beforeSendTransaction: (event: TransactionEvent) => {
    transactionEvents.push(event);
    return null;
  },
  beforeSend: (event: ErrorEvent) => {
    errorEvents.push(event);
    return null;
  },
});
Sentry.patchExpressModule({ express });

const app = (express as unknown as { default: typeof express }).default();
let server: Server;
Deno.test('verify express server behavior', async () => {
  async function main() {
    app.use(async (_, res, next) => {
      res.setHeader('content-type', 'text/html');
      res.setHeader('connection', 'close');
      // simulate doing some work so that the requests overlap
      await new Promise(res => setTimeout(res, 50));
      next();
    });

    app.get('/user/:user/error/:error', (req, res) => {
      Sentry.captureMessage(`Error for user ${req.params.user}: ${req.params.error}`);
      const userId = req.params.user || 'unknown';
      Sentry.setUser({ id: userId });
      Sentry.setTag('request.id', userId || 'unknown');
      res.send(`error ${req.params.error} for user ${req.params.user}`);
    });
    app.get('/user/:user', (req, res) => {
      const userId = req.params.user || 'unknown';
      Sentry.setUser({ id: userId });
      Sentry.setTag('request.id', userId || 'unknown');
      res.setHeader('connection', 'close');
      res.send(`Hello, ${req.params.user}`);
    });

    let onListen: ((_: unknown) => void) | undefined = undefined;
    const p = new Promise(resolve => (onListen = resolve));
    server = createServer((req, res) => {
      // TODO: this should be done with a node:http integration
      Sentry.withIsolationScope(async scope => {
        scope.setClient(Sentry.getClient());
        return Sentry.continueTrace(
          {
            sentryTrace: String(req.headers['sentry-trace'] || ''),
            baggage: req.headers.baggage?.toString(),
          },
          () => {
            Sentry.startSpan(
              {
                name: 'http.server',
              },
              async () => {
                app(req, res);
                return new Promise(resolve => res.on('finish', resolve));
              },
            );
          },
        );
      });
    }).listen(PORT, onListen);
    await p;
  }

  let responses: [Response, Response, Response];
  let responseText: [string, string, string];

  await main();

  responses = await Promise.all([
    fetch(`http://localhost:15443/user/user1/error/true`),
    fetch(`http://localhost:15443/user/user2`),
    fetch(`http://localhost:15443/user/user3/error/true`),
  ]);
  responseText = await Promise.all([responses[0].text(), responses[1].text(), responses[2].text()]);
  server.close();

  const expectText = ['error true for user user1', 'Hello, user2', 'error true for user user3'];
  assertEquals(responseText[0], expectText[0]);
  assertEquals(responseText[1], expectText[1]);
  assertEquals(responseText[2], expectText[2]);

  assertEquals(transactionEvents.length, 3);
  assertEquals(errorEvents.length, 2);
  // verify that each transaction has expected spans, and that each is separate
  const seen: string[] = [];
  for (const tx of transactionEvents) {
    if (!tx.contexts) {
      throw new Error('no context for transaction!');
    }
    const { trace } = tx.contexts;
    if (!trace) {
      throw new Error('no trace in transaction');
    }
    assertEquals(trace.parent_span_id, undefined);
    const { span_id, trace_id } = trace;
    for (const s of seen) {
      assertNotEquals(trace_id, s);
    }
    seen.push(trace_id);
    assertNotEquals(span_id, undefined);
    if (!Array.isArray(tx.spans)) {
      throw new Error('no spans in transaction');
    }
    const results: { description: string; op: string }[] = [];
    let whichRoute: string = '';
    for (const span of tx.spans) {
      const { op, description, origin, parent_span_id } = span;
      assertEquals(parent_span_id, span_id);
      assertEquals(span.trace_id, trace_id);
      assertEquals(origin, 'auto.http.express');
      assertEquals(typeof op, 'string');
      assertEquals(typeof description, 'string');
      results.push({ op, description } as { op: string; description: string });
      if (op === 'request_handler.express') whichRoute = description as string;
    }
    const expect = [
      { op: 'middleware.express', description: 'query' },
      { op: 'middleware.express', description: 'expressInit' },
      { op: 'middleware.express', description: '<anonymous>' },
      { op: 'request_handler.express', description: whichRoute },
    ];
    assertEquals(results.length, expect.length);
    for (let i = 0; i < expect.length; i++) {
      const e = expect[i];
      const t = results[i];
      if (!e) throw new Error('got unexpected result');
      if (!t) throw new Error('failed to get expected result');
      assertEquals(t.op, e.op);
      assertEquals(t.description, e.description);
    }
  }
});
