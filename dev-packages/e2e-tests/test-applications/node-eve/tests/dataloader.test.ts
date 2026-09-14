import { expect, test } from '@playwright/test';
import { collectStreamedSpans, getSpanOp } from '@sentry-internal/test-utils';
import { runAgentTurn } from './utils';

const APP = 'node-eve';
const useOrchestrion = process.env.USE_ORCHESTRION === '1';

const isDataloaderSpan = (span: { attributes?: Record<string, { value?: unknown }> }): boolean =>
  getSpanOp(span) === 'cache.get' && span.attributes?.['sentry.origin']?.value === 'auto.db.dataloader';

/**
 * `dataloader` is instrumented by Sentry via orchestrion (a module transform),
 * unlike the Vercel AI SDK which publishes to a native diagnostics channel.
 * Under eve's bundled server output the transform only runs when the Sentry
 * loader is registered at process start via
 * `NODE_OPTIONS=--import=@sentry/node/import` (the `node-eve (orchestrion)`
 * variant, `USE_ORCHESTRION=1`). Without that bootstrap no dataloader span is
 * captured, so this test is expected to fail — see `test.fail(!useOrchestrion)`.
 */
test('captures orchestrion-instrumented dataloader spans (requires the --import bootstrap)', async ({ baseURL }) => {
  test.fail(!useOrchestrion, 'orchestrion module instrumentation needs NODE_OPTIONS=--import=@sentry/node/import');

  // Accumulate the workflow trace's spans across envelopes. With orchestrion we
  // wait for the dataloader span itself; without it that span never arrives, so
  // anchor on the (always-present) tool-execution span and let the assertion
  // below fail fast rather than time out.
  const spansPromise = collectStreamedSpans(APP, spansOfTrace =>
    useOrchestrion
      ? spansOfTrace.some(isDataloaderSpan)
      : spansOfTrace.some(span => getSpanOp(span) === 'gen_ai.execute_tool'),
  );

  await runAgentTurn(baseURL!, 'Count items: apple, banana, cherry');

  const spans = await spansPromise;
  const dataloaderSpan = spans.find(isDataloaderSpan);

  expect(dataloaderSpan?.attributes?.['sentry.op']?.value).toBe('cache.get');
  expect(dataloaderSpan?.attributes?.['sentry.origin']?.value).toBe('auto.db.dataloader');
});
