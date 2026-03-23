import { expect, it } from 'vitest';
import type { Event } from '@sentry/core';
import { createRunner } from '../../../runner';

it('propagates trace from worker to worker via service binding', async ({ signal }) => {
  const traceIds: string[] = [];

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
      traceIds.push(transactionEvent.contexts?.trace?.trace_id || '');
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
      traceIds.push(transactionEvent.contexts?.trace?.trace_id || '');
    })
    .unordered()
    .start(signal);
  await runner.makeRequest('get', '/');
  await runner.completed();

  expect(traceIds).toHaveLength(2);
  expect(traceIds[0]).toBe(traceIds[1]);
});
