import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../runner';

it('captures errors thrown by a Durable Object fetch handler', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.exception?.values?.[0]?.type).toBe('Error');
      expect(event.exception?.values?.[0]?.value).toBe('Test error from Durable Object fetch handler');
      expect(event.exception?.values?.[0]?.mechanism).toEqual({
        type: 'auto.faas.cloudflare.durable_object',
        handled: false,
      });
    })
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.exception?.values?.[0]?.type).toBe('Error');
      expect(event.exception?.values?.[0]?.value).toBe('Test error from Durable Object fetch handler');
      expect(event.exception?.values?.[0]?.mechanism).toEqual({
        type: 'auto.http.cloudflare',
        handled: false,
      });
    })
    .unordered()
    .start(signal);

  await runner.makeRequest('get', '/', { expectError: true });
  await runner.completed();
});
