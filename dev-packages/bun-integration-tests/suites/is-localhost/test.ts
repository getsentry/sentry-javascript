import type { Envelope, SerializedStreamedSpan, SerializedStreamedSpanContainer } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';

function getSpans(envelope: Envelope): SerializedStreamedSpan[] {
  return (envelope[1][0][1] as SerializedStreamedSpanContainer).items;
}

// The runner always requests `http://localhost:<port>`, so only the `true` case is reachable here.
// The `false` case is covered by the unit tests for `isLocalhostRequest`.
it('sets sentry.is_localhost on every streamed span', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const spans = getSpans(envelope);

      expect(spans.some(span => span.is_segment)).toBe(true);
      expect(spans.some(span => span.name === 'child-span')).toBe(true);

      for (const span of spans) {
        expect(span.attributes['sentry.is_localhost']).toEqual({ value: true, type: 'boolean' });
      }
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});
