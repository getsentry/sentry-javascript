import { expect, test } from '@playwright/test';
import { RUNTIME } from './constants';

test.skip(RUNTIME !== 'cloudflare', 'Covers the Worker entry and `tunnelRoute` of `vite.cloudflare.config.ts`');

test("Keeps the Worker's ExecutionContext when the Sentry Vite plugins wrap the server entry", async ({ request }) => {
  const response = await request.get('/test-execution-context');

  expect(await response.text()).toBe('function');
});

test('Answers a fixed tunnelRoute with the DSN that `withSentry` initializes', async ({ request }) => {
  // A DSN the server doesn't allow, so the tunnel answers without forwarding anywhere.
  const envelopeHeader = { dsn: 'https://other@o1.ingest.sentry.io/42', sent_at: new Date().toISOString() };
  const response = await request.post('/monitoring', {
    data: `${JSON.stringify(envelopeHeader)}\n`,
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
  });

  expect(response.status()).toBe(403);
});
