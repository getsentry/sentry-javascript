import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('Applies the options of `httpServerIntegration` imported from `@sentry/cloudflare/request`', async ({
  request,
}) => {
  const errorPromise = waitForError('hydrogen-react-router-7', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'Action Error';
  });

  const body = JSON.stringify({ payload: 'x'.repeat(4_000) });
  await request.post('/action-error', { data: body, headers: { 'content-type': 'application/json' } });

  const errorEvent = await errorPromise;

  // `maxRequestBodySize: 'small'` truncates at 1,000 bytes, the default (`'medium'`) would keep the full body.
  expect(errorEvent.request?.data).toBe(`${body.slice(0, 997)}...`);
});
