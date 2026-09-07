import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { expect, it } from 'vitest';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
} from '@sentry/core';
import type { SerializedStreamedSpan } from '@sentry/core';
import { createRunner } from '../../../runner';
import { getSpansFromEnvelope } from '../../../spanUtils';

it('Workflow steps create segment spans with correct attributes', async ({ signal }) => {
  let spans: SerializedStreamedSpan[] = [];

  // Both steps run in one trace and arrive in one envelope. The trigger request runs in its own
  // trace, so its envelope carries no step span and does not match here.
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const envelopeSpans = getSpansFromEnvelope(envelope);

      expect(envelopeSpans.some(span => span.name === 'step-one')).toBe(true);
      expect(envelopeSpans.some(span => span.name === 'step-two')).toBe(true);
      spans = envelopeSpans;
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/workflow/trigger');
  await runner.completed();

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
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.faas.cloudflare.workflow' },
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
