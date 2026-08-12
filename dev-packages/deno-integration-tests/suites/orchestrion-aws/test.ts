// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { Span } from '@sentry/core';
import type { DenoClient } from '@sentry/deno';
import { init, spanToJSON, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';
import { SENTRY_OP } from '@sentry/conventions/attributes';

Deno.test('aws-sdk instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Aws'), `Aws should be in defaults, got ${names.join(', ')}`);
});

// Drives the `orchestrion:@smithy/smithy-client:send` channel — the same events
// the orchestrion transform publishes around the AWS SDK v3 `Client.prototype.send`
// — so no live AWS client is needed. The subscriber reads the command and client
// config off the channel context and opens an `rpc` span. The span end is deferred
// until the client's async `region()` backfill settles (see the integration), so
// the parent span is held open until the `spanEnd` hook reports the child ended.
Deno.test('aws-sdk instrumentation: orchestrion @smithy/smithy-client:send channel produces a nested rpc span', async () => {
  resetGlobals();
  const sink = transactionSink();
  const client = init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  }) as DenoClient;

  // The rpc span ends only after the deferred region backfill settles. Wait on the
  // concrete `spanEnd` signal rather than a timer, so the parent stays open until the
  // child has actually ended and can be captured on the transaction.
  const rpcSpanEnded = new Promise<void>(resolve => {
    client.on('spanEnd', (span: Span) => {
      if (spanToJSON(span).attributes[SENTRY_OP] === 'rpc') {
        resolve();
      }
    });
  });

  const channel = tracingChannel('orchestrion:@smithy/smithy-client:send');

  // The shape the transform attaches: `arguments[0]` is the v3 command, `self` the
  // client. `serviceId` names the service; the command constructor name (minus the
  // `Command` suffix) names the operation. `region()` resolves the client region.
  const command = { input: {}, constructor: { name: 'DescribeAlarmsCommand' } };
  const ctx: Record<string, unknown> = {
    arguments: [command],
    self: { config: { serviceId: 'CloudWatch', region: () => 'us-east-1' }, constructor: { name: 'CloudWatchClient' } },
  };

  await startSpan({ name: 'parent', op: 'test' }, async () => {
    channel.start.runStores(ctx, () => undefined);
    // `send` returns a promise, so `tracePromise` publishes `end` before it settles
    // (no `result` yet — the `end` subscriber is a no-op then), then `asyncEnd` once
    // the promise resolves with the result. Mirror that order so the span closes on
    // `asyncEnd` alone, as it does in production.
    channel.end.publish(ctx);
    ctx.result = { $metadata: { requestId: 'req-123', httpStatusCode: 200 } };
    channel.asyncEnd.publish(ctx);
    await rpcSpanEnded;
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const awsSpan = parent.spans?.find(s => s.op === 'rpc');
  assertExists(awsSpan, `expected an rpc child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(awsSpan!.description, 'CloudWatch.DescribeAlarms');
  assertEquals(awsSpan!.data?.['rpc.system'], 'aws-api');
  assertEquals(awsSpan!.data?.['rpc.service'], 'CloudWatch');
  assertEquals(awsSpan!.data?.['rpc.method'], 'DescribeAlarms');
  assertEquals(awsSpan!.data?.['cloud.region'], 'us-east-1');
  assertEquals(awsSpan!.data?.['sentry.origin'], 'auto.aws.aws_sdk');
});
