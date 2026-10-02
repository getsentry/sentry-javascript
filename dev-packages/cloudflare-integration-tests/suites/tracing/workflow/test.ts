import { SENTRY_SEGMENT_NAME_SOURCE, SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { expect, it } from 'vitest';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE } from '@sentry/core';
import { createRunner } from '../../../runner';

it('Workflow steps create segment spans with correct attributes', async ({ signal }) => {
  const runner = createRunner(__dirname).start(signal);
  // Both steps run in one trace, but each step flushes its own span, so they arrive in separate
  // envelopes. The trigger request runs in its own trace and does not match here.
  const spansPromise = runner.collectStreamedSpans(spansOfTrace =>
    ['step-one', 'step-two'].every(stepName => spansOfTrace.some(span => span.name === stepName)),
  );

  await runner.makeRequest('get', '/workflow/trigger');

  const spans = await spansPromise;

  for (const stepName of ['step-one', 'step-two']) {
    expect(spans.find(span => span.name === stepName)).toEqual(
      expect.objectContaining({
        name: stepName,
        span_id: expect.any(String),
        trace_id: expect.any(String),
        is_segment: true,
        status: 'ok',
        attributes: expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'function' },
          [SENTRY_ORIGIN]: { type: 'string', value: 'auto.faas.cloudflare.workflow' },
          [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'task' },
          [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: { type: 'integer', value: 1 },
          'code.function.name': { type: 'string', value: stepName },
          'workflow.step.name': { type: 'string', value: stepName },
          'cloudflare.workflow.attempt': { type: 'integer', value: 1 },
        }),
      }),
    );
  }
});
