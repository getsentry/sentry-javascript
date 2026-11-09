import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { randomUUID } from 'node:crypto';

// The event proxy's DSN, so the forwarded envelopes arrive at the proxy.
const BROWSER_DSN = 'http://public@localhost:3031/1337';
// `getTunnelPath(BROWSER_DSN)`
const TUNNEL_PATH = '/qpo967';

/**
 * An error envelope as the browser SDK sends it through the tunnel.
 */
function browserEnvelope(message: string): string {
  const eventId = randomUUID().replace(/-/g, '');

  return [
    JSON.stringify({ dsn: BROWSER_DSN, event_id: eventId }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify({ event_id: eventId, exception: { values: [{ type: 'Error', value: message }] } }),
  ].join('\n');
}

test('Forwards a tunnel request from a Pages Router API route without a body parser', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-15-basepath', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Tunneled through a Pages Router API route';
  });

  const response = await request.post('/my-app/api/tunnel', {
    data: browserEnvelope('Tunneled through a Pages Router API route'),
  });

  expect(response.status()).toBe(200);
  await errorEventPromise;
});

test('Forwards a tunnel request from middleware under the basePath', async ({ request }) => {
  const errorEventPromise = waitForError('nextjs-15-basepath', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Tunneled through middleware';
  });

  const response = await request.post(`/my-app${TUNNEL_PATH}`, {
    data: browserEnvelope('Tunneled through middleware'),
  });

  expect(response.status()).toBe(200);
  await errorEventPromise;
});
