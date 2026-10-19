import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { getTunnelPath } from '@sentry/core';
import { connect } from 'node:net';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const BASE_PATH = process.env.E2E_TEST_BASE_PATH ?? '';
const TUNNEL_PATH = new RegExp(`^${BASE_PATH}/[a-z0-9]{1,7}$`);

test('answers the managed tunnel before the app auth middleware', async ({ page }) => {
  // The variant's auth middleware rejects every other POST.
  expect((await page.request.post(`${BASE_PATH}/api/anything`, { data: 'x' })).status()).toBe(401);

  const tunnelServerSpanPromise = waitForStreamedSpan(
    'nitro-3',
    span => getSpanOp(span) === 'http.server' && TUNNEL_PATH.test(String(span.attributes['url.path']?.value ?? '')),
  );
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto(`${BASE_PATH}/`);
  const tunnelResponse = await tunnelResponsePromise;

  expect(tunnelResponse.status()).toBe(200);
  expect(new URL(tunnelResponse.url()).origin).toBe(new URL(page.url()).origin);

  // Anchor on a regular server span requested after the tunnel traffic: spans flush in order, so a tunnel span
  // would arrive first.
  const anchorSpanPromise = waitForStreamedSpan(
    'nitro-3',
    span =>
      getSpanOp(span) === 'http.server' &&
      String(span.attributes['url.path']?.value ?? '') === `${BASE_PATH}/api/test-transaction`,
  );
  await page.request.get(`${BASE_PATH}/api/test-transaction`);

  const winner = await Promise.race([
    tunnelServerSpanPromise.then(() => 'tunnel' as const),
    anchorSpanPromise.then(() => 'anchor' as const),
  ]);
  expect(winner).toBe('anchor');
});

test('answers the managed tunnel without app middleware', async ({ request }) => {
  const dsn = 'http://public@localhost:3031/1337';
  const envelopeHeader = { dsn, sent_at: new Date().toISOString() };
  const response = await request.post(`${BASE_PATH}${getTunnelPath(dsn)}`, {
    data: `${JSON.stringify(envelopeHeader)}\n${JSON.stringify({ type: 'client_report' })}\n${JSON.stringify({ timestamp: Date.now() / 1000, discarded_events: [] })}\n`,
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
  });

  expect(response.headers()['x-sentry-tunnel']).toBe('1');
  expect(response.status()).toBe(200);
});

test('does not report a client that drops the connection before the envelope header as an error', async ({
  request,
}) => {
  const dsn = 'http://public@localhost:3031/1337';
  const firstErrorPromise = waitForError('nitro-3', () => true);

  // Part of the envelope header line, without its newline, then the connection drops.
  await new Promise<void>(resolve => {
    const socket = connect(3030, 'localhost', () => {
      socket.write(
        `POST ${BASE_PATH}${getTunnelPath(dsn)} HTTP/1.1\r\nHost: localhost:3030\r\nContent-Type: application/x-sentry-envelope\r\nContent-Length: 1000000\r\n\r\n`,
      );
      socket.write(JSON.stringify({ dsn, padding: 'x'.repeat(1000) }).slice(0, 500));
      setTimeout(() => {
        socket.destroy();
        resolve();
      }, 300);
    });
  });

  // Errors are sent in order, so one from the dropped request would arrive before this one.
  await request.get(`${BASE_PATH}/api/test-error`);

  const firstError = await firstErrorPromise;
  expect(firstError.exception?.values?.[0]?.value).toBe('This is a test error');
});
