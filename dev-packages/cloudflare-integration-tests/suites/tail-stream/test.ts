import type { Event } from '@sentry/core';
import { join } from 'path';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';

it('captures errors thrown by the handler that tailStream returns', async ({ signal }) => {
  const runner = createRunner(__dirname)
    // A tail consumer in another `wrangler dev` process does not receive
    // streaming tail events, so the producer runs in the same process.
    .withWranglerArgs('-c', join(__dirname, 'dist/cloudflare_tail_stream_producer/wrangler.json'))
    .expect(envelope => {
      const event = envelope[1][0]?.[1] as Event;
      expect(event.exception?.values?.[0]).toEqual(
        expect.objectContaining({
          type: 'Error',
          value: 'Error from the tailStream outcome handler',
          mechanism: { type: 'auto.faas.cloudflare.tail_stream', handled: false },
        }),
      );
    })
    .start(signal);

  await runner.makeRequest('get', '/');
  await runner.completed();
});
