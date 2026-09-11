import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp, SerializedStreamedSpan } from '@sentry-internal/test-utils';

const APP = 'node-mastra';

const attrValue = (span: SerializedStreamedSpan, key: string): unknown => span.attributes?.[key]?.value;

// `dataloader` is instrumented by Sentry through orchestrion — the same runtime
// module transform that instruments `@mastra/core`. This exercises a non-Mastra
// orchestrion package to confirm the runtime injection works broadly, not just for
// the Mastra constructor. Runs unconditionally in both the prod (`mastra start`)
// and dev (`mastra dev`) variants.
const isDataloaderSpan = (span: SerializedStreamedSpan): boolean =>
  getSpanOp(span) === 'cache.get' && attrValue(span, 'sentry.origin') === 'auto.db.dataloader';

// Driven by the dedicated `/dataloader` route, which uses `dataloader` inside an
// explicit active span. (The agent flow can't be used here: Mastra runs tools with
// inactive spans, and dataloader's `load` needs an active parent to emit a span.)
test('captures orchestrion-instrumented dataloader spans', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(APP, spansOfTrace => spansOfTrace.some(isDataloaderSpan));

  const res = await fetch(`${baseURL}/dataloader`, { method: 'POST' });
  expect(res.status).toBe(200);
  await res.text();

  const spans = await spansPromise;
  const dataloaderSpan = spans.find(isDataloaderSpan);

  expect(dataloaderSpan).toBeDefined();
  expect(getSpanOp(dataloaderSpan!)).toBe('cache.get');
  expect(attrValue(dataloaderSpan!, 'sentry.origin')).toBe('auto.db.dataloader');
});
