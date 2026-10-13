import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';
import { getSpanOp } from '../../../spanUtils';

// The worker is built by the Sentry Vite plugin (auto-instrumentation on). The
// runner detects `vite.config.mts`, runs `vite build`, and serves the generated
// output — so these spans only arrive if the build-time transform wrapped
// `MyWorkflow` with `instrumentWorkflowWithSentry` and the default export with
// `withSentry`.
it('auto-instruments a Workflow class', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);

  // The workflow step and the triggering request are separate executions, each with its own trace.
  const stepSpansPromise = runner.collectStreamedSpansUntilSegment('step-one');
  const triggerSpansPromise = runner.collectStreamedSpansUntilSegment(
    span => span.attributes['url.path']?.value === '/workflow/trigger',
  );

  await runner.makeRequest('get', '/workflow/trigger');

  const stepSpan = (await stepSpansPromise).find(span => span.name === 'step-one');
  expect(getSpanOp(stepSpan!)).toBe('function');
  expect(stepSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.faas.cloudflare.workflow' });

  const triggerSpan = (await triggerSpansPromise).find(span => span.is_segment);
  // `/workflow/trigger` is a raw URL, so the streamed segment name keeps the method only.
  expect(triggerSpan?.name).toBe('GET');
  expect(getSpanOp(triggerSpan!)).toBe('http.server');
  expect(triggerSpan?.attributes['sentry.origin']).toEqual({ type: 'string', value: 'auto.http.cloudflare' });
});
