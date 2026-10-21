import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, SerializedStreamedSpan } from '@sentry-internal/test-utils';
import { runAgentTurn } from './utils';

const APP = 'node-mastra';

const attrValue = (span: SerializedStreamedSpan, key: string): unknown => span.attributes?.[key]?.value;

// `dataloader` is instrumented by Sentry through orchestrion — the same runtime
// module transform that instruments `@mastra/core`. This exercises a non-Mastra
// orchestrion package to confirm the runtime injection works broadly, not just for
// the Mastra agent. Runs unconditionally in both the prod (`mastra start`) and dev
// (`mastra dev`) variants.
//
// With span streaming the span name is the low-cardinality op (`cache.get`) for every
// dataloader operation, so the `load` calls are told apart by `db.operation.name`
// (`batch` nests under a load — dataloader's own internal structure).
const isDataloaderLoadSpan = (span: SerializedStreamedSpan): boolean =>
  getSpanOp(span) === 'cache.get' &&
  attrValue(span, 'sentry.origin') === 'auto.db.dataloader' &&
  attrValue(span, 'db.operation.name') === 'load';

// The `count_items` tool (unique to this test) uses `dataloader` internally. No explicit
// `Sentry.startSpan` in the tool: the Mastra integration makes the exporter's `execute_tool` span
// active while the tool runs (via Mastra's `executeWithContext`), so `dataloader.load`'s `cache.get`
// span nests under the tool span. This proves orchestrion instrumentation reaches code run through the
// agent's tool-call flow AND that the active-context bridge parents it correctly.
const callsCountItems = (span: SerializedStreamedSpan): boolean =>
  getSpanOp(span) === 'gen_ai.execute_tool' && attrValue(span, 'gen_ai.tool.name') === 'count_items';

test('nests orchestrion-instrumented dataloader spans under the tool span', async ({ baseURL }) => {
  // Scope to this turn's trace by both the unique `count_items` tool call and the
  // dataloader span it produces, so we don't match another test's agent trace.
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace => spansOfTrace.some(callsCountItems) && spansOfTrace.some(isDataloaderLoadSpan),
  );

  await runAgentTurn(baseURL!, 'Use the count_items tool to count these names: apple, banana, cherry.');

  const spans = await spansPromise;
  const loadSpans = spans.filter(isDataloaderLoadSpan);
  const toolSpan = spans.find(callsCountItems);

  expect(loadSpans.length).toBeGreaterThan(0);
  for (const loadSpan of loadSpans) {
    expect(getSpanOp(loadSpan)).toBe('cache.get');
    expect(attrValue(loadSpan, 'sentry.origin')).toBe('auto.db.dataloader');
  }

  // The active-context bridge makes the exporter's tool span the parent — no manual span in the tool.
  expect(toolSpan).toBeDefined();
  for (const loadSpan of loadSpans) {
    expect(loadSpan.parent_span_id).toBe(toolSpan!.span_id);
  }
});
