import type { Envelope, SerializedStreamedSpanContainer } from '@sentry/core';
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

function getSpanContainer(envelope: Envelope): SerializedStreamedSpanContainer {
  const spanItem = envelope[1].find(item => item[0].type === 'span');
  expect(spanItem).toBeDefined();
  return spanItem![1] as SerializedStreamedSpanContainer;
}

it('keeps the cron out of the scheduled span name when span streaming is enabled', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .withWranglerArgs('--test-scheduled')
    .expect(envelope => {
      const segmentSpan = getSpanContainer(envelope).items.find(span => !!span.is_segment);

      expect(segmentSpan).toBeDefined();
      expect(segmentSpan!.name).toBe('scheduled');
      expect(segmentSpan!.attributes).toEqual(
        expect.objectContaining({
          [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'function' },
          [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.faas.cloudflare.scheduled' },
          'code.function.name': { type: 'string', value: 'scheduled' },
          // Relay infers the description from the span name, so the original, cron-bearing name is
          // preserved explicitly to keep it visible in the UI.
          'sentry.description': { type: 'string', value: expect.stringMatching(/^Scheduled Cron/) },
          'faas.trigger': { type: 'string', value: 'timer' },
        }),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/__scheduled');
  await runner.completed();
});
