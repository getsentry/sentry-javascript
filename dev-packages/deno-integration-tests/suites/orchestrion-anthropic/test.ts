// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('anthropic instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Anthropic_AI'), `Anthropic_AI should be in defaults, got ${names.join(', ')}`);
});

Deno.test('anthropic instrumentation: orchestrion @anthropic-ai/sdk:chat channel produces a nested gen_ai span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
  });

  const channel = tracingChannel('orchestrion:@anthropic-ai/sdk:chat');

  // `arguments[0]` is the request body passed to `messages.create(body, options)`.
  const body = { model: 'claude-3-5-sonnet-latest', messages: [{ role: 'user', content: 'hi' }] };
  const ctx: Record<string, unknown> = { arguments: [body] };

  startSpan({ name: 'parent', op: 'test' }, () => {
    channel.start.runStores(ctx, () => undefined);
    channel.end.publish(ctx);
    ctx.result = {
      id: 'msg_1',
      model: 'claude-3-5-sonnet-20241022',
      usage: { input_tokens: 10, output_tokens: 5 },
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

  const aiSpan = children.find(s => getSpanOp(s) === 'gen_ai.chat');
  assertExists(aiSpan, `expected a gen_ai.chat child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`);
  assertEquals(aiSpan.name, 'chat claude-3-5-sonnet-latest');
  assertEquals(aiSpan.attributes['gen_ai.provider.name']?.value, 'anthropic');
  assertEquals(aiSpan.attributes['gen_ai.operation.name']?.value, 'chat');
  assertEquals(aiSpan.attributes['gen_ai.request.model']?.value, 'claude-3-5-sonnet-latest');
  assertEquals(aiSpan.attributes['gen_ai.response.model']?.value, 'claude-3-5-sonnet-20241022');
  assertEquals(aiSpan.attributes['gen_ai.usage.total_tokens']?.value, 15);
  assertEquals(aiSpan.attributes['sentry.origin']?.value, 'auto.ai.anthropic');
});
