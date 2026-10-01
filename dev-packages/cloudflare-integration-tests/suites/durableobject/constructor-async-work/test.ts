import type { Event, SerializedStreamedSpanContainer } from '@sentry/core';
import { SENTRY_OP, SENTRY_ORIGIN, URL_PATH } from '@sentry/conventions/attributes';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

// Every envelope of both requests is expected, and `failOnUnexpected` fails the test on any other one.
// All of them are sent after the constructor work ran, so an error or span from that work would arrive
// before the runner completes.
it('does not capture errors a Durable Object catches in work its constructor started', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .failOnUnexpected()
    .expect(envelope => {
      expect(envelope[1][0][0].type).toBe('event');
      expect((envelope[1][0][1] as Event).message).toBe('block-concurrency-while ping: degraded');
    })
    .expect(envelope => {
      expect(envelope[1][0][0].type).toBe('event');
      expect((envelope[1][0][1] as Event).message).toBe('async-method ping: degraded');
    })
    .expectN(2, envelope => {
      expect(envelope[1][0][0].type).toBe('span');
      const container = envelope[1][0][1] as SerializedStreamedSpanContainer;
      expect(container.items.map(item => item.name)).toEqual(['ping']);
      expect(container.items[0]?.attributes[SENTRY_OP]?.value).toBe('rpc');
      expect(container.items[0]?.attributes[SENTRY_ORIGIN]?.value).toBe('auto.faas.cloudflare.durable_object');
    })
    .expect(envelope => {
      expect(envelope[1][0][0].type).toBe('span');
      const container = envelope[1][0][1] as SerializedStreamedSpanContainer;
      expect(container.items.map(item => item.attributes[URL_PATH]?.value)).toEqual(['/block-concurrency-while']);
      expect(container.items[0]?.attributes[SENTRY_OP]?.value).toBe('http.server');
    })
    .expect(envelope => {
      expect(envelope[1][0][0].type).toBe('span');
      const container = envelope[1][0][1] as SerializedStreamedSpanContainer;
      expect(container.items.map(item => item.attributes[URL_PATH]?.value)).toEqual(['/async-method']);
      expect(container.items[0]?.attributes[SENTRY_OP]?.value).toBe('http.server');
    })
    .start(signal);

  const blockConcurrencyResponse = await runner.makeRequest<string>('get', '/block-concurrency-while');
  const asyncMethodResponse = await runner.makeRequest<string>('get', '/async-method');

  expect(blockConcurrencyResponse).toBe('degraded');
  expect(asyncMethodResponse).toBe('degraded');
  await runner.completed();
});
