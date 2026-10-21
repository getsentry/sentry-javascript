// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('google-genai instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Google_GenAI'), `Google_GenAI should be in defaults, got ${names.join(', ')}`);
});

Deno.test('google-genai instrumentation: orchestrion @google/genai:generate-content channel produces a nested gen_ai span', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
  });

  const channel = tracingChannel('orchestrion:@google/genai:generate-content');

  // `arguments[0]` is the request params passed to `generateContent(params)`.
  const params = { model: 'gemini-1.5-flash', contents: 'hi' };
  const ctx: Record<string, unknown> = { arguments: [params] };

  startSpan({ name: 'parent', op: 'test' }, () => {
    channel.start.runStores(ctx, () => undefined);
    channel.end.publish(ctx);
    ctx.result = {
      modelVersion: 'gemini-1.5-flash-002',
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
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

  const aiSpan = children.find(s => getSpanOp(s) === 'gen_ai.generate_content');
  assertExists(
    aiSpan,
    `expected a gen_ai.generate_content child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`,
  );
  assertEquals(aiSpan.name, 'generate_content gemini-1.5-flash');
  assertEquals(aiSpan.attributes['gen_ai.provider.name']?.value, 'google_genai');
  assertEquals(aiSpan.attributes['gen_ai.operation.name']?.value, 'generate_content');
  assertEquals(aiSpan.attributes['gen_ai.request.model']?.value, 'gemini-1.5-flash');
  assertEquals(aiSpan.attributes['gen_ai.response.model']?.value, 'gemini-1.5-flash-002');
  assertEquals(aiSpan.attributes['gen_ai.usage.total_tokens']?.value, 15);
  assertEquals(aiSpan.attributes['sentry.origin']?.value, 'auto.ai.google_genai');
});
