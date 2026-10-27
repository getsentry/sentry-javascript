import type { Envelope, Event } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../../runner';

function itemOf(envelope: Envelope): { type: string; event: Event } {
  const [header, event] = envelope[1][0] as [{ type: string }, Event];
  return { type: header.type, event };
}

function messageEvent(message: string): (envelope: Envelope) => void {
  return envelope => {
    const { type, event } = itemOf(envelope);
    expect(type).toBe('event');
    expect(event.message).toBe(message);
  };
}

// The `onSpanCreated` and `onSpanEnd` hooks of the worker set these attributes.
function apiTransaction(envelope: Envelope): void {
  const { type, event } = itemOf(envelope);
  expect(type).toBe('transaction');
  expect(event.transaction).toBe('GET /api');
  expect(event.contexts?.trace?.data).toEqual(
    expect.objectContaining({
      'test.on_span_created': '/api',
      'test.on_span_end': 201,
    }),
  );
}

// Each test makes a request without a span, then a request with one. With `failOnUnexpected`, a
// transaction for the first request fails the test, as it arrives before the second one.

it('does not create a span for a request that ignoreIncomingRequests matches', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .failOnUnexpected()
    .expect(messageEvent('Health check'))
    .expect(apiTransaction)
    .start(signal);

  await runner.makeRequest('get', '/health');
  await runner.makeRequest('get', '/api');
  await runner.completed();
});

it('does not create a span for a static asset request by default', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .failOnUnexpected()
    .expect(messageEvent('Static asset'))
    .expect(apiTransaction)
    .start(signal);

  await runner.makeRequest('get', '/favicon.ico');
  await runner.makeRequest('get', '/api');
  await runner.completed();
});

it('sends events from a streamed response without a span after the stream finishes', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .unordered()
    .failOnUnexpected()
    .expect(messageEvent('Streamed after handler return'))
    .expect(apiTransaction)
    .start(signal);

  expect(await runner.makeRequest<string>('get', '/health/stream')).toBe('ab');
  await runner.makeRequest('get', '/api');
  await runner.completed();
});
