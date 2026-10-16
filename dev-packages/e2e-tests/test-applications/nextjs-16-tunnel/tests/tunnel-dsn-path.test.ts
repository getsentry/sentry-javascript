import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan, waitForStreamedSpans } from '@sentry-internal/test-utils';
import type { SerializedStreamedSpan } from '@sentry/core';
import { getTunnelPath } from '@sentry/core';

const TUNNEL_PATH = getTunnelPath('http://public@localhost:3031/1337');

test('sends events to the DSN-derived path, served by the app', async ({ page }) => {
  const tunnelRequests: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST') {
      tunnelRequests.push(new URL(request.url()).pathname);
    }
  });

  const errorPromise = waitForError('nextjs-16-tunnel', event => {
    return event.exception?.values?.[0]?.value === 'Managed tunnel error';
  });

  await page.goto('/');
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('Managed tunnel error');
    });
  });

  expect(await errorPromise).toBeDefined();
  expect(tunnelRequests).toContain(TUNNEL_PATH);
});

test('does not create server spans for tunnel requests', async ({ page }) => {
  const serverSpans: SerializedStreamedSpan[] = [];
  void waitForStreamedSpans('nextjs-16-tunnel', spans => {
    serverSpans.push(...spans.filter(span => span.is_segment));
    return false;
  });

  const errorPromise = waitForError('nextjs-16-tunnel', event => {
    return event.exception?.values?.[0]?.value === 'Managed tunnel span error';
  });

  await page.goto('/');
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('Managed tunnel span error');
    });
  });
  await errorPromise;

  // Spans flush in order, so a span for the tunnel request would arrive before the one for this request.
  const anchorSpanPromise = waitForStreamedSpan(
    'nextjs-16-tunnel',
    span => span.is_segment && getSpanOp(span) === 'http.server' && span.name === 'GET /',
  );
  await page.request.get('/');
  await anchorSpanPromise;

  const tunnelSpans = serverSpans.filter(
    span => span.name.includes(TUNNEL_PATH!) || span.name.includes('sentry-tunnel'),
  );
  expect(tunnelSpans).toEqual([]);
});

test('lets tunnel requests through auth middleware with `isTunnelRequest`', async ({ request }) => {
  const headers = { 'content-type': 'application/x-sentry-envelope', 'x-e2e-require-auth': '1' };
  const data = `${JSON.stringify({ dsn: 'http://public@localhost:3031/1337' })}\n`;

  expect((await request.post(TUNNEL_PATH!, { headers, data })).status()).toBe(200);
  expect((await request.post('/notatunnel', { headers, data })).status()).toBe(401);
});

test('answers 404 to an envelope POST on any other path', async ({ request }) => {
  const response = await request.post('/notatunnel', {
    headers: { 'content-type': 'application/x-sentry-envelope' },
    data: `${JSON.stringify({ dsn: 'http://public@localhost:3031/1337' })}\n`,
  });

  expect(response.status()).toBe(404);
});
