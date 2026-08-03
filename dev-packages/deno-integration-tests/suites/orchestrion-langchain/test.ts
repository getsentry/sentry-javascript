// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('langchain instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('LangChain'), `LangChain should be in defaults, got ${names.join(', ')}`);
});

Deno.test('langchain instrumentation: orchestrion @langchain/openai:embedQuery channel produces a nested embeddings span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const channel = tracingChannel('orchestrion:@langchain/openai:embedQuery');

  // `self` is the embeddings instance: its constructor name infers the provider
  // system and `model` names the span. `arguments[0]` is the text to embed.
  const self = { constructor: { name: 'OpenAIEmbeddings' }, model: 'text-embedding-3-small' };
  const ctx: Record<string, unknown> = { self, arguments: ['hello world'] };

  startSpan({ name: 'parent', op: 'test' }, () => {
    channel.start.runStores(ctx, () => undefined);
    channel.end.publish(ctx);
    ctx.result = [0.1, 0.2, 0.3];
    channel.asyncEnd.publish(ctx);
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const aiSpan = parent.spans?.find(s => s.op === 'gen_ai.embeddings');
  assertExists(aiSpan, `expected a gen_ai.embeddings child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(aiSpan!.description, 'embeddings text-embedding-3-small');
  assertEquals(aiSpan!.data?.['gen_ai.system'], 'openai');
  assertEquals(aiSpan!.data?.['gen_ai.operation.name'], 'embeddings');
  assertEquals(aiSpan!.data?.['gen_ai.request.model'], 'text-embedding-3-small');
  assertEquals(aiSpan!.data?.['sentry.origin'], 'auto.ai.langchain');
});
