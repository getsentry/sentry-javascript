import { expect, it } from 'vitest';
import { createRunner } from '../../../../runner';

// workerd does not allow a channel publish at module scope, so the SDK publishes the `compile` event with the
// first request. `graph.cjs` gets the CommonJS build of the SDK's channel module, and the request wrapper is the
// ES module build.
it('instruments a graph that a CommonJS module compiles at module scope', async ({ signal }) => {
  const runner = createRunner(__dirname).ignore('event').start(signal);

  const spansPromise = runner.collectStreamedSpans(spansOfTrace => spansOfTrace.some(span => span.is_segment));

  await runner.makeRequest('get', '/');

  const spans = await spansPromise;

  expect(spans.filter(span => !span.is_segment)).toEqual([
    expect.objectContaining({
      name: 'invoke_agent module_scope_agent',
      status: 'ok',
      attributes: expect.objectContaining({
        'sentry.op': { type: 'string', value: 'gen_ai.invoke_agent' },
        'sentry.origin': { type: 'string', value: 'auto.ai.langgraph' },
      }),
    }),
  ]);
});
