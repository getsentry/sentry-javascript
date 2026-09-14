import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { runAgentTurn } from './utils';

const APP = 'node-flue';
const useOrchestrion = process.env.USE_ORCHESTRION === '1';

const isDataloaderSpan = (span: { attributes?: Record<string, { value?: unknown }> }): boolean =>
  span.attributes?.['sentry.origin']?.value === 'auto.db.dataloader';

/**
 * `dataloaderIntegration` relies on orchestrion, a module transform, so it only emits spans when the
 * server starts with `NODE_OPTIONS=--import=@sentry/node/import` (the `node-flue (orchestrion)`
 * variant). The integration installs and subscribes either way, so the absence of a span is the only
 * thing that distinguishes the two — hence `test.fail(!useOrchestrion)`.
 *
 * Flue needs no build configuration for this: a Flue node build leaves dependencies as bare
 * specifiers, so `dataloader` stays a real module the transform can hook. If Flue ever switches to
 * a bundled server output, this test is what catches it.
 *
 * The loader is called from inside a tool so its span lands in the agent's trace, beside the AI
 * spans, rather than in a trace of its own.
 */
test('captures orchestrion-instrumented dataloader spans in the same trace as the AI spans', async ({ baseURL }) => {
  test.fail(!useOrchestrion, 'orchestrion module instrumentation needs NODE_OPTIONS=--import=@sentry/node/import');

  // With orchestrion, wait for the dataloader span itself. Without it that span never arrives, so
  // anchor on the always-present tool span and let the assertion below fail fast rather than time
  // the test out.
  const spansPromise = collectStreamedSpans(APP, spansOfTrace =>
    useOrchestrion
      ? spansOfTrace.some(isDataloaderSpan)
      : spansOfTrace.some(span => getSpanOp(span) === 'gen_ai.execute_tool'),
  );

  await runAgentTurn(baseURL!, 'dataloader-conversation', 'Please call count_items to count the items.');

  const spans = await spansPromise;
  const executeTool = spans.find(span => span.attributes?.['gen_ai.tool.name']?.value === 'count_items');
  const dataloaderSpan = spans.find(isDataloaderSpan);

  expect(dataloaderSpan?.attributes?.['sentry.origin']?.value).toBe('auto.db.dataloader');
  // Same trace as the AI spans, and underneath the tool that triggered it.
  expect(dataloaderSpan?.trace_id).toBe(executeTool?.trace_id);
  expect(dataloaderSpan?.parent_span_id).toBe(executeTool?.span_id);
});
