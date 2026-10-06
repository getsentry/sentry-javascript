// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('vercel-ai instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('VercelAI'), `VercelAI should be in defaults, got ${names.join(', ')}`);
});

Deno.test('vercel-ai instrumentation: orchestrion:ai:generateText channel produces a nested invoke_agent span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
  });

  const channel = tracingChannel('orchestrion:ai:generateText');

  // `arguments[0]` is the options object passed to `generateText(options)`.
  const callOptions = { model: { provider: 'openai', modelId: 'gpt-4o' }, prompt: 'hi' };
  const ctx: Record<string, unknown> = { arguments: [callOptions] };

  startSpan({ name: 'parent', op: 'test' }, () => {
    channel.start.runStores(ctx, () => undefined);
    channel.end.publish(ctx);
    ctx.result = {
      usage: { inputTokens: 10, outputTokens: 5 },
      response: { modelId: 'gpt-4o' },
    };
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

  const aiSpan = children.find(s => getSpanOp(s) === 'gen_ai.invoke_agent');
  assertExists(
    aiSpan,
    `expected a gen_ai.invoke_agent child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`,
  );
  assertEquals(aiSpan.name, 'invoke_agent');
  assertEquals(aiSpan.attributes['gen_ai.provider.name']?.value, 'openai');
  assertEquals(aiSpan.attributes['gen_ai.operation.name']?.value, 'invoke_agent');
  assertEquals(aiSpan.attributes['gen_ai.request.model']?.value, 'gpt-4o');
  assertEquals(aiSpan.attributes['vercel.ai.operationId']?.value, 'ai.generateText');
  assertEquals(aiSpan.attributes['gen_ai.usage.total_tokens']?.value, 15);
  assertEquals(aiSpan.attributes['sentry.origin']?.value, 'auto.vercelai.channel');
});
