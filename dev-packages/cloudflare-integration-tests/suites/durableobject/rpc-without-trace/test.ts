import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../runner';

it('captures errors thrown by a Durable Object RPC method called without trace metadata', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.exception?.values?.[0]?.type).toBe('Error');
      expect(event.exception?.values?.[0]?.value).toBe('Test error from Durable Object RPC method');
      expect(event.exception?.values?.[0]?.mechanism).toEqual({
        type: 'auto.faas.cloudflare.durable_object',
        handled: false,
      });
    })
    .start(signal);

  const response = await runner.makeRequest<string>('get', '/');
  expect(response).toBe('Test error from Durable Object RPC method');

  await runner.completed();
});
