// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { resetGlobals, transactionSink, withTimeout } from '../../src/index.ts';

Deno.test('langgraph instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({ traceLifecycle: 'static', dsn: 'https://username@domain/123' }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('LangGraph'), `LangGraph should be in defaults, got ${names.join(', ')}`);
});

Deno.test('langgraph instrumentation: orchestrion stateGraphCompile channel wraps the compiled graph invoke', async () => {
  resetGlobals();
  const sink = transactionSink();
  init({
    traceLifecycle: 'static',
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    beforeSendTransaction: sink.beforeSendTransaction,
  });

  const channel = tracingChannel('orchestrion:@langchain/langgraph:stateGraphCompile');

  const originalInvoke = () => Promise.resolve('result');
  const compiledGraph = { invoke: originalInvoke };
  // `arguments[0]` is the compile options; `name` names the wrapped invoke_agent span.
  const ctx: Record<string, unknown> = { arguments: [{ name: 'my-agent' }] };

  await startSpan({ name: 'parent', op: 'test' }, async () => {
    channel.start.runStores(ctx, () => undefined);
    ctx.result = compiledGraph;
    channel.end.publish(ctx);
    assert(compiledGraph.invoke !== originalInvoke, "compiled graph's invoke should be wrapped");
    await compiledGraph.invoke();
  });

  const parent = await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  const invokeAgentSpan = parent.spans?.find(s => s.op === 'gen_ai.invoke_agent');
  assertExists(
    invokeAgentSpan,
    `expected a gen_ai.invoke_agent child span, got ops: ${parent.spans?.map(s => s.op).join(', ')}`,
  );
  assertEquals(invokeAgentSpan!.description, 'invoke_agent my-agent');
  assertEquals(invokeAgentSpan!.data?.['gen_ai.operation.name'], 'invoke_agent');
  assertEquals(invokeAgentSpan!.data?.['gen_ai.agent.name'], 'my-agent');
  assertEquals(invokeAgentSpan!.data?.['sentry.origin'], 'auto.ai.langgraph');
});
