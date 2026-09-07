import { SENTRY_SEGMENT_NAME_SOURCE } from '@sentry/conventions/attributes';
import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE,
} from '@sentry/core';
import { createRunner } from '../../../runner';
import { getSpansFromEnvelope } from '../../../spanUtils';

it('Scheduled handler creates a segment span with correct attributes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .withWranglerArgs('--test-scheduled')
    .expect(envelope => {
      const spans = getSpansFromEnvelope(envelope);

      expect(spans).toHaveLength(1);
      expect(spans[0]).toEqual(
        expect.objectContaining({
          name: expect.stringMatching(/^Scheduled Cron/),
          span_id: expect.any(String),
          trace_id: expect.any(String),
          is_segment: true,
          status: 'ok',
          attributes: expect.objectContaining({
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: { type: 'string', value: 'function' },
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: { type: 'string', value: 'auto.faas.cloudflare.scheduled' },
            [SENTRY_SEGMENT_NAME_SOURCE]: { type: 'string', value: 'task' },
            [SEMANTIC_ATTRIBUTE_SENTRY_SAMPLE_RATE]: { type: 'integer', value: 1 },
            'faas.cron': { type: 'string', value: expect.any(String) },
            'faas.time': { type: 'string', value: expect.any(String) },
            'faas.trigger': { type: 'string', value: 'timer' },
          }),
        }),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/__scheduled');
  await runner.completed();
});

it('captures errors thrown by the scheduled handler', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .withWranglerArgs('--test-scheduled')
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.exception?.values?.[0]?.type).toBe('Error');
      expect(event.exception?.values?.[0]?.value).toBe('Test error from scheduled handler');
      expect(event.exception?.values?.[0]?.mechanism).toEqual({
        type: 'auto.faas.cloudflare.scheduled',
        handled: false,
      });
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', `/__scheduled?cron=${encodeURIComponent('0 0 * * *')}`, { expectError: true });
  await runner.completed();
});
