import type { Envelope, Event } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

it('captures a fire-and-forget rejection during the request', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('transaction', 'span')
    .expect((envelope: Envelope) => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.level).toBe('error');
      expect(event.exception?.values?.[0]).toEqual(
        expect.objectContaining({
          type: 'Error',
          value: 'Fire-and-forget rejection',
          stacktrace: { frames: expect.any(Array) },
          mechanism: { type: 'auto.faas.cloudflare.unhandled_rejection', handled: false },
        }),
      );
      // The request data proves the event was captured on the scope of the invocation that rejected.
      expect(event.request?.url).toContain('/fire-and-forget');
    })
    .start(signal);

  await runner.makeRequest('get', '/fire-and-forget');
  await runner.completed();
});

it('captures a rejection that happens after the response was sent', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('transaction', 'span')
    .expect((envelope: Envelope) => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.level).toBe('error');
      expect(event.exception?.values?.[0]).toEqual(
        expect.objectContaining({
          type: 'Error',
          value: 'Rejection after response',
          stacktrace: { frames: expect.any(Array) },
          mechanism: { type: 'auto.faas.cloudflare.unhandled_rejection', handled: false },
        }),
      );
      expect(event.request?.url).toContain('/after-response');
    })
    .start(signal);

  await runner.makeRequest('get', '/after-response');
  await runner.completed();
});

it('does not capture a rejection that is handled', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .ignore('transaction', 'span')
    .unordered()
    .failOnUnexpected()
    .expect((envelope: Envelope) => {
      const event = envelope[1]?.[0]?.[1] as Event;
      expect(event.message).toBe('Sentinel after handled rejection');
    })
    .start(signal);

  await runner.makeRequest('get', '/handled');
  await runner.completed();
});
