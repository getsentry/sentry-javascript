import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { runAgentTurn } from './utils';

const APP = 'node-mastra';

const attrValue = (span: SerializedStreamedSpan, key: string): unknown => span.attributes?.[key]?.value;

// `dataloader` is instrumented by Sentry through orchestrion — the same runtime
// module transform that instruments `@mastra/core`. This exercises a non-Mastra
// orchestrion package to confirm the runtime injection works broadly, not just for
// the Mastra constructor. Runs unconditionally in both the prod (`mastra start`)
// and dev (`mastra dev`) variants.
const isDataloaderSpan = (span: SerializedStreamedSpan): boolean =>
  getSpanOp(span) === 'cache.get' && attrValue(span, 'sentry.origin') === 'auto.db.dataloader';

// The `count_items` tool uses `dataloader` internally. Mastra runs tools with
// inactive spans, so the tool opens its own active span via `Sentry.startSpan`
// (bundle-side, single SDK copy) — dataloader's `load` then emits its `cache.get`
// span nested under it. This proves orchestrion instrumentation reaches code run
// through the agent's tool-call flow.
const callsCountItems = (span: SerializedStreamedSpan): boolean =>
  getSpanOp(span) === 'gen_ai.execute_tool' && attrValue(span, 'gen_ai.tool.name') === 'count_items';

test('captures orchestrion-instrumented dataloader spans from an agent tool', async ({ baseURL }) => {
  // Scope to this turn's trace by both the unique `count_items` tool call and the
  // dataloader span it produces, so we don't match another test's agent trace.
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace => spansOfTrace.some(callsCountItems) && spansOfTrace.some(isDataloaderSpan),
  );

  await runAgentTurn(baseURL!, 'Use the count_items tool to count these names: apple, banana, cherry.');

  const spans = await spansPromise;
  const dataloaderSpan = spans.find(isDataloaderSpan);

  expect(dataloaderSpan).toBeDefined();
  expect(getSpanOp(dataloaderSpan!)).toBe('cache.get');
  expect(attrValue(dataloaderSpan!, 'sentry.origin')).toBe('auto.db.dataloader');
});
