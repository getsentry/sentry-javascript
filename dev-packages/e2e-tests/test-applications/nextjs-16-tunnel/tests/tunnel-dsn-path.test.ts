import { expect, test } from '@playwright/test';
import { waitForError, waitForStreamedSpans } from '@sentry-internal/test-utils';
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

  await page.goto('/');
  await page
    .evaluate(() => {
      throw new Error('Managed tunnel span error');
    })
    .catch(() => undefined);
  await page.waitForTimeout(3000);

  const tunnelSpans = serverSpans.filter(
    span => span.name.includes(TUNNEL_PATH!) || span.name.includes('sentry-tunnel'),
  );
  expect(tunnelSpans).toEqual([]);
});

test('answers 404 to an envelope POST on any other path', async ({ request }) => {
  const response = await request.post('/notatunnel', {
    headers: { 'content-type': 'application/x-sentry-envelope' },
    data: `${JSON.stringify({ dsn: 'http://public@localhost:3031/1337' })}\n`,
  });

  expect(response.status()).toBe(404);
});
