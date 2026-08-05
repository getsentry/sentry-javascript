// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('google-genai instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('Google_GenAI'), `Google_GenAI should be in defaults, got ${names.join(', ')}`);
});

Deno.test('google-genai instrumentation: orchestrion @google/genai:generate-content channel produces a nested gen_ai span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
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

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const aiSpan = parent.spans?.find(s => s.op === 'gen_ai.generate_content');
  assertExists(
    aiSpan,
    `expected a gen_ai.generate_content child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`,
  );
  assertEquals(aiSpan!.description, 'generate_content gemini-1.5-flash');
  assertEquals(aiSpan!.data?.['gen_ai.provider.name'], 'google_genai');
  assertEquals(aiSpan!.data?.['gen_ai.operation.name'], 'generate_content');
  assertEquals(aiSpan!.data?.['gen_ai.request.model'], 'gemini-1.5-flash');
  assertEquals(aiSpan!.data?.['gen_ai.response.model'], 'gemini-1.5-flash-002');
  assertEquals(aiSpan!.data?.['gen_ai.usage.total_tokens'], 15);
  assertEquals(aiSpan!.data?.['sentry.origin'], 'auto.ai.google_genai');
});
