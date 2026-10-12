import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { RUNTIME } from './constants';

const usesManagedTunnelRoute =
  (process.env.E2E_TEST_TUNNEL_ROUTE_MODE ?? 'off') !== 'off' || process.env.E2E_TEST_CUSTOM_TUNNEL_ROUTE === '1';

test.skip(usesManagedTunnelRoute, 'Default e2e suites run only in the proxy variant');

test('keeps the scope data of concurrent requests apart', async ({ request }) => {
  const tags = ['alpha', 'beta', 'gamma'];

  const errorPromises = tags.map(tag =>
    waitForError(
      'tanstackstart-react',
      errorEvent => errorEvent.exception?.values?.[0]?.value === `Isolation error ${tag}`,
    ),
  );

  await Promise.all(tags.map(tag => request.get(`/api/isolation?tag=${tag}`)));

  const errorEvents = await Promise.all(errorPromises);

  errorEvents.forEach((errorEvent, index) => {
    expect(errorEvent.tags?.['isolation-tag']).toBe(tags[index]);
    expect(errorEvent.transaction).toBe('GET /api/isolation');
  });

  const traceIds = errorEvents.map(errorEvent => errorEvent.contexts?.trace?.trace_id);
  expect(new Set(traceIds).size).toBe(tags.length);
});

test('keeps the scope data of an SSR request out of the next request on the same connection', async ({ request }) => {
  // On Deno, `node:http` starts the next request on a keep-alive connection in the async context of the SSR request
  // before it, so the scopes of the new request are cloned from the scopes of the SSR request.
  test.fail(RUNTIME === 'deno', 'Deno starts the next request in the async context of the SSR request');

  const errorEventPromise = waitForError(
    'tanstackstart-react',
    errorEvent => errorEvent.exception?.values?.[0]?.value === 'Isolation error after-ssr',
  );

  await request.get('/isolation-ssr');
  await request.get('/api/isolation?tag=after-ssr');

  const errorEvent = await errorEventPromise;

  expect(errorEvent.tags?.['isolation-tag']).toBe('after-ssr');
  expect(errorEvent.tags?.['ssr-tag']).toBeUndefined();
});
