import { expect, test } from '@playwright/test';
import {
  isServerSpanAt,
  makeClientReportEnvelope,
  waitForError,
  watchForTunnelSpan,
} from '@sentry-internal/test-utils';
import { getTunnelPath } from '@sentry/core';
import { connect } from 'node:net';

test.skip(!process.env.E2E_TEST_TUNNEL, 'Only runs in the tunnel variant');

const BASE_PATH = process.env.E2E_TEST_BASE_PATH ?? '';
const TUNNEL_PATH = new RegExp(`^${BASE_PATH}/[a-z0-9]{1,7}$`);

test('answers the managed tunnel before the app auth middleware', async ({ page }) => {
  // The variant's auth middleware rejects every other POST.
  expect((await page.request.post(`${BASE_PATH}/api/anything`, { data: 'x' })).status()).toBe(401);

  const raceTunnelSpan = watchForTunnelSpan('nitro-3', isServerSpanAt(TUNNEL_PATH));
  const tunnelResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST' && TUNNEL_PATH.test(new URL(response.url()).pathname),
  );

  await page.goto(`${BASE_PATH}/`);

  expect((await tunnelResponsePromise).status()).toBe(200);
  expect(
    await raceTunnelSpan(isServerSpanAt(`${BASE_PATH}/api/test-transaction`), () =>
      page.request.get(`${BASE_PATH}/api/test-transaction`),
    ),
  ).toBe('anchor');
});

test('answers a request to the managed tunnel itself', async ({ request }) => {
  const dsn = 'http://public@localhost:3031/1337';
  const response = await request.post(`${BASE_PATH}${getTunnelPath(dsn)}`, {
    data: makeClientReportEnvelope(dsn),
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
  });

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
