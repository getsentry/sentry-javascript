import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { newConversationId, runAgentTurn } from './utils';

const APP = 'node-flue-vite';

const isDataloaderSpan = (span: { attributes?: Record<string, { value?: unknown }> }): boolean =>
  span.attributes?.['sentry.origin']?.value === 'auto.db.dataloader';

/**
 * Flue's Node build keeps every dependency in `package.json` external, also with the Sentry Vite
 * plugin, so `dataloader` is instrumented by the `--import` loader at runtime rather than at build time.
 */
test('captures dataloader spans in the same trace as the AI spans', async ({ baseURL }) => {
  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      spansOfTrace.some(span => span.attributes?.['gen_ai.tool.name']?.value === 'count_items') &&
      spansOfTrace.some(isDataloaderSpan),
  );

  await runAgentTurn(baseURL!, newConversationId('dataloader'), 'Please call count_items to count the items.');

  const spans = await spansPromise;
  const dataloaderSpan = spans.find(isDataloaderSpan);
  const toolSpan = spans.find(span => span.attributes?.['gen_ai.tool.name']?.value === 'count_items');

  expect(getSpanOp(dataloaderSpan!)).toBe('cache.get');
  expect(dataloaderSpan?.trace_id).toBe(toolSpan?.trace_id);
});
