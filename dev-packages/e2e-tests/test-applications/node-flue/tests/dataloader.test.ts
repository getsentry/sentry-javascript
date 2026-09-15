import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { runAgentTurn } from './utils';

const APP = 'node-flue';

const isDataloaderSpan = (span: { attributes?: Record<string, { value?: unknown }> }): boolean =>
  span.attributes?.['sentry.origin']?.value === 'auto.db.dataloader';

/**
 * `dataloader` is instrumented through orchestrion, a module transform, so it only produces spans
 * with the loader registered at process start. A Flue node build needs no externals config for
 * that: dependencies stay bare specifiers, so `dataloader` is still a real module to hook. If Flue
 * ever switches to a bundled server output, this is what catches it.
 *
 * The loader is called from inside a tool so its span lands in the agent's trace, beside the AI
 * spans, rather than in a trace of its own.
 */
test('captures orchestrion-instrumented dataloader spans in the same trace as the AI spans', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(APP, spansOfTrace => spansOfTrace.some(isDataloaderSpan));

  await runAgentTurn(baseURL!, 'dataloader-conversation', 'Please call count_items to count the items.');

  const spans = await spansPromise;
  const executeTool = spans.find(span => span.attributes?.['gen_ai.tool.name']?.value === 'count_items');
  const dataloaderSpan = spans.find(isDataloaderSpan);

  expect(getSpanOp(dataloaderSpan!)).toBe('cache.get');
  expect(dataloaderSpan?.trace_id).toBe(executeTool?.trace_id);
  expect(dataloaderSpan?.parent_span_id).toBe(executeTool?.span_id);
});
