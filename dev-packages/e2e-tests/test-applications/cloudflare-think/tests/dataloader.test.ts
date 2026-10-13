import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { attr, isTurnOf, newAgentId, runAgentTurn, type StreamedSpan } from './utils';

const APP = 'cloudflare-think';

const isDataloaderSpan = (span: { attributes?: Record<string, { value?: unknown }> }): boolean =>
  span.attributes?.['sentry.origin']?.value === 'auto.db.dataloader';

/**
 * `dataloader` is instrumented by the orchestrion module transform rather than by patching anything
 * at runtime, so its spans are the probe for whether channel injection reached the worker at all.
 * Libraries that do not need the transform (`node:http`, and the AI spans themselves) would pass
 * even if injection were broken.
 *
 * On Cloudflare the injection is done at build time by `sentryCloudflareVitePlugin()`, so unlike the
 * Node apps this needs no `--import` bootstrap. A Think worker is heavily bundled, which is exactly
 * the situation where a transform can silently stop applying, so this is the test that catches it.
 *
 * The loader runs inside a tool so its spans land in the turn's trace rather than one of their own.
 */
test('captures orchestrion-instrumented dataloader spans in the same trace as the AI spans', async ({ baseURL }) => {
  const agentId = newAgentId('dataloader');
  const ofThisTurn = isTurnOf(agentId);

  const spansPromise = collectStreamedSpans(
    APP,
    spansOfTrace =>
      ofThisTurn(spansOfTrace as StreamedSpan[]) &&
      spansOfTrace.some(span => attr(span as StreamedSpan, 'gen_ai.tool.name') === 'get_weather') &&
      spansOfTrace.some(isDataloaderSpan),
  );

  await runAgentTurn(baseURL!, agentId, 'What is the weather in Paris?');

  const spans = await spansPromise;
  const dataloaderSpan = spans.find(isDataloaderSpan);
  const toolSpan = spans.find(span => span.attributes?.['gen_ai.tool.name']?.value === 'get_weather');

  // Sharing the trace is the point. Not asserting the exact parent: the model may call the tool more
  // than once, so the tool span found here is not reliably the one that ran this loader.
  expect(getSpanOp(dataloaderSpan!)).toBe('cache.get');
  expect(dataloaderSpan?.trace_id).toBe(toolSpan?.trace_id);
});
