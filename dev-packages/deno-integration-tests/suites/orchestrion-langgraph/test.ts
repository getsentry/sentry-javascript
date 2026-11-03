// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { flush, init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
import { assertEquals } from 'https://deno.land/std@0.212.0/assert/assert_equals.ts';
import { assertExists } from 'https://deno.land/std@0.212.0/assert/assert_exists.ts';
import { getSpanOp, resetGlobals, spanSink, withTimeout } from '../../src/index.ts';

Deno.test('langgraph instrumentation: included in default integrations (Deno 2.8.0+)', () => {
  resetGlobals();
  const client = init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
  }) as DenoClient;
  const names = client.getOptions().integrations.map(i => i.name);
  assert(names.includes('LangGraph'), `LangGraph should be in defaults, got ${names.join(', ')}`);
});

Deno.test('langgraph instrumentation: orchestrion stateGraphCompile channel wraps the compiled graph invoke', async () => {
  resetGlobals();
  const sink = spanSink();
  init({
    dsn: 'https://username@domain/123',
    tracesSampleRate: 1,
    transport: sink.transport,
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

  const invokeAgentSpan = children.find(s => getSpanOp(s) === 'gen_ai.invoke_agent');
  assertExists(
    invokeAgentSpan,
    `expected a gen_ai.invoke_agent child span, got ops: ${children.map(s => getSpanOp(s)).join(', ')}`,
  );
  assertEquals(invokeAgentSpan.name, 'invoke_agent my-agent');
  assertEquals(invokeAgentSpan.attributes['gen_ai.operation.name']?.value, 'invoke_agent');
  assertEquals(invokeAgentSpan.attributes['gen_ai.agent.name']?.value, 'my-agent');
  assertEquals(invokeAgentSpan.attributes['sentry.origin']?.value, 'auto.ai.langgraph');
});
