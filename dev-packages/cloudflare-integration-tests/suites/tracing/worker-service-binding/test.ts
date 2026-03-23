import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../runner';

it('propagates trace from worker to worker via service binding', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'http.server',
              data: expect.objectContaining({
                'sentry.origin': 'auto.http.cloudflare',
              }),
              origin: 'auto.http.cloudflare',
            }),
          }),
          transaction: 'GET /',
        }),
      );
    })
    .expect(envelope => {
      const transactionEvent = envelope[1]?.[0]?.[1] as Event;
      expect(transactionEvent).toEqual(
        expect.objectContaining({
          contexts: expect.objectContaining({
            trace: expect.objectContaining({
              op: 'http.server',
              data: expect.objectContaining({
                'sentry.origin': 'auto.http.cloudflare',
              }),
              origin: 'auto.http.cloudflare',
            }),
          }),
          transaction: 'GET /hello',
        }),
      );
    })
    .unordered()
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();
});
