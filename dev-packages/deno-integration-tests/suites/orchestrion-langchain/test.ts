// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('langchain instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('LangChain'), `LangChain should be in defaults, got ${names.join(', ')}`);
});

Deno.test('langchain instrumentation: orchestrion @langchain/openai:embedQuery channel produces a nested embeddings span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
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

  await flush();

  const parent = await withTimeout(
    sink.waitFor(span => span.is_segment && span.name === 'parent'),
    5000,
    "'parent' segment span",
  );
  const children = sink.spans.filter(span => span.parent_span_id === parent.span_id);
  assertEquals(children.length, 1);
  assertEquals(children[0]!.trace_id, parent.trace_id);
  assertEquals(children[0]!.is_segment, false);

  const aiSpan = children.find(s => getSpanOp(s) === 'gen_ai.embeddings');
  assertExists(
    aiSpan,
    `expected a gen_ai.embeddings child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`,
  );
  assertEquals(aiSpan.name, 'embeddings text-embedding-3-small');
  assertEquals(aiSpan.attributes['gen_ai.provider.name']?.value, 'openai');
  assertEquals(aiSpan.attributes['gen_ai.operation.name']?.value, 'embeddings');
  assertEquals(aiSpan.attributes['gen_ai.request.model']?.value, 'text-embedding-3-small');
  assertEquals(aiSpan.attributes['sentry.origin']?.value, 'auto.ai.langchain');
});
