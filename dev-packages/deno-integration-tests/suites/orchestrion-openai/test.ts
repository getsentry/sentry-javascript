// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('openai instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('OpenAI'), `OpenAI should be in defaults, got ${names.join(', ')}`);
});

Deno.test('openai instrumentation: orchestrion:openai:chat channel produces a nested gen_ai span', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const channel = tracingChannel('orchestrion:openai:chat');

  // `arguments[0]` is the request body passed to `create(body, options)`.
  const body = { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] };
  const ctx: Record<string, unknown> = { arguments: [body] };

  startSpan({ name: 'parent', op: 'test' }, () => {
    channel.start.runStores(ctx, () => undefined);
    channel.end.publish(ctx);
    ctx.result = {
      id: 'chatcmpl-1',
      model: 'gpt-4o-2024-08-06',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    channel.asyncEnd.publish(ctx);
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const aiSpan = parent.spans?.find(s => s.op === 'gen_ai.chat');
  assertExists(aiSpan, `expected a gen_ai.chat child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`);
  assertEquals(aiSpan!.description, 'chat gpt-4o');
  assertEquals(aiSpan!.data?.['gen_ai.system'], 'openai');
  assertEquals(aiSpan!.data?.['gen_ai.operation.name'], 'chat');
  assertEquals(aiSpan!.data?.['gen_ai.request.model'], 'gpt-4o');
  assertEquals(aiSpan!.data?.['gen_ai.response.model'], 'gpt-4o-2024-08-06');
  assertEquals(aiSpan!.data?.['gen_ai.usage.total_tokens'], 15);
  assertEquals(aiSpan!.data?.['sentry.origin'], 'auto.ai.orchestrion.openai');
});
