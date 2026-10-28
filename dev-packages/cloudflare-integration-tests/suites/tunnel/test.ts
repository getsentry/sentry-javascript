import type { Envelope, Event } from '@sentry/core';
import { createEnvelope, getTunnelPath, serializeEnvelope, uuid4 } from '@sentry/core';
import { expect, it } from 'vitest';
import { createRunner } from '../../runner';

/**
 * An event envelope as the browser SDK sends it through the tunnel, for the worker's DSN.
 */
function browserEnvelope(dsn: string, message: string): string {
  const eventId = uuid4();

  return serializeEnvelope(
    createEnvelope({ dsn, event_id: eventId }, [[{ type: 'event' }, { event_id: eventId, message }]]),
  ) as string;
}

/**
 * Expects an envelope whose event has this message.
 */
function eventWithMessage(message: string): (envelope: Envelope) => void {
  return envelope => {
    expect((envelope[1][0]?.[1] as Event).message).toBe(message);
  };
}

it('forwards with handleTunnelRequestIfMatched inside withSentry, and outside it with named options', async ({
  signal,
}) => {
  const runner = createRunner(__dirname)
    .expect(eventWithMessage('inside withSentry'))
    .expect(eventWithMessage('outside withSentry'))
    .expect(eventWithMessage('done'))
    .start(signal);
  const dsn = (await runner.makeRequest<string>('get', '/dsn'))!;
  const tunnelPath = getTunnelPath(dsn)!;

  await runner.makeRequest('post', tunnelPath, { data: browserEnvelope(dsn, 'inside withSentry') });
  await runner.makeRequest('post', `/outside${tunnelPath}`, { data: browserEnvelope(dsn, 'outside withSentry') });
  expect(await runner.makeRequest('post', '/api', { data: browserEnvelope(dsn, 'not a tunnel') })).toBe('app');

  await runner.makeRequest('get', '/done');
  await runner.completed();
});
