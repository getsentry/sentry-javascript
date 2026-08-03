// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('vercel-ai instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('VercelAI'), `VercelAI should be in defaults, got ${names.join(', ')}`);
});

Deno.test('vercel-ai instrumentation: orchestrion:ai:generateText channel produces a nested invoke_agent span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
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

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const aiSpan = parent.spans?.find(s => s.op === 'gen_ai.invoke_agent');
  assertExists(
    aiSpan,
    `expected a gen_ai.invoke_agent child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`,
  );
  assertEquals(aiSpan!.description, 'invoke_agent');
  assertEquals(aiSpan!.data?.['gen_ai.system'], 'openai');
  assertEquals(aiSpan!.data?.['gen_ai.operation.name'], 'invoke_agent');
  assertEquals(aiSpan!.data?.['gen_ai.request.model'], 'gpt-4o');
  assertEquals(aiSpan!.data?.['vercel.ai.operationId'], 'ai.generateText');
  assertEquals(aiSpan!.data?.['gen_ai.usage.total_tokens'], 15);
  assertEquals(aiSpan!.data?.['sentry.origin'], 'auto.vercelai.channel');
});
