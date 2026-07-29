// <reference lib="deno.ns" />

import { tracingChannel } from 'node:diagnostics_channel';
import type { DenoClient } from '@sentry/deno';
import { init, startSpan } from '@sentry/deno';
import { assert } from 'https://deno.land/std@0.212.0/assert/assert.ts';
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

  // The subscriber replaces `invoke` on the compiled graph, so it needs to be a settable property.
  let invoke = () => Promise.resolve('result');
  const compiledGraph = {
    get invoke() {
      return invoke;
    },
    set invoke(fn) {
      invoke = fn;
    },
  };
  // `arguments[0]` is the compile options.
  const ctx: Record<string, unknown> = { arguments: [{ name: 'my-agent' }] };

  const originalInvoke = compiledGraph.invoke;

  startSpan({ name: 'parent', op: 'test' }, () => {
    channel.start.runStores(ctx, () => undefined);
    ctx.result = compiledGraph;
    channel.end.publish(ctx);
  });

  await withTimeout(
    sink.waitFor(t => t.transaction === 'parent'),
    5000,
    "'parent' transaction",
  );

  assert(compiledGraph.invoke !== originalInvoke, "compiled graph's invoke should be wrapped");
});
