import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { isServerSpanAt, waitForError, waitForStreamedSpan, watchForTunnelSpan } from '@sentry-internal/test-utils';

const APP_NAME = 'tanstackstart-react-tunnel';
const CUSTOM_TUNNEL_PATH = '/app/custom-monitor';
const ERROR_MESSAGE = 'Custom tunnel route test error';

function postEnvelope(request: APIRequestContext) {
  const envelope = [
    { dsn: 'http://public@localhost:3031/1337', sent_at: new Date().toISOString() },
    { type: 'event' },
    { exception: { values: [{ type: 'Error', value: ERROR_MESSAGE }] } },
  ]
    .map(part => JSON.stringify(part))
    .join('\n');

  return request.post(CUSTOM_TUNNEL_PATH, {
    data: envelope,
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
  });
}

test('forwards envelopes from a `createSentryTunnelRoute` route', async ({ request }) => {
  const errorPromise = waitForError(APP_NAME, event => event.exception?.values?.[0]?.value === ERROR_MESSAGE);

  expect((await postEnvelope(request)).status()).toBe(200);
  await errorPromise;
});

test('sends no spans of a `createSentryTunnelRoute` route after its first request', async ({ request }) => {
  test.fixme(
    process.env.TEST_ENV === 'development',
    "`vite dev` creates the request's span outside of where the route registers its `ignoreSpans`",
  );
  const isAnchorSpan = isServerSpanAt('/app/api/anchor');

  // The route ignores its spans only from its first request on, so that one's span can still be sent. Spans flush in
  // order, so it's gone once the span of a later request arrived.
  await postEnvelope(request);
  const anchorSpanPromise = waitForStreamedSpan(APP_NAME, isAnchorSpan);
  await request.get('/app/api/anchor');
  await anchorSpanPromise;

  const raceTunnelSpan = watchForTunnelSpan(APP_NAME, isServerSpanAt(CUSTOM_TUNNEL_PATH));
  expect((await postEnvelope(request)).status()).toBe(200);
  expect(await raceTunnelSpan(isAnchorSpan, () => request.get('/app/api/anchor'))).toBe('anchor');
});
