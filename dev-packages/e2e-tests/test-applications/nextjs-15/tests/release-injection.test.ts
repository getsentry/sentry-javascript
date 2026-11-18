import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { HTTP_SERVER, PAGELOAD } from '@sentry/conventions/op';

test('sends App Router server and pageload spans with the release', async ({ page }) => {
  const serverSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === 'GET /pageload-tracing' && getSpanOp(span) === HTTP_SERVER && span.is_segment;
  });
  const pageloadSpanPromise = waitForStreamedSpan('nextjs-15', span => {
    return span.name === '/pageload-tracing' && getSpanOp(span) === PAGELOAD && span.is_segment;
  });

  await page.goto('/pageload-tracing');

  const [serverSpan, pageloadSpan] = await Promise.all([serverSpanPromise, pageloadSpanPromise]);
  expect(serverSpan.attributes['sentry.release']?.value).toBe('foobar123');
  expect(pageloadSpan.attributes['sentry.release']?.value).toBe('foobar123');
});

test('sends Pages Router client errors with the release', async ({ page }) => {
  const errorPromise = waitForError('nextjs-15', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === 'click error';
  });

  await page.goto('/42/click-error');
  await page.click('#error-button');

  expect((await errorPromise).release).toBe('foobar123');
});

test('keeps the release out of the client bundles with `release.inject: false`', async ({ page }) => {
  test.skip(!process.env.E2E_RELEASE_NOT_INJECTED, 'Only for builds with `release.inject: false`');

  const scriptBodies: Promise<string>[] = [];
  page.on('response', response => {
    if (response.url().includes('/_next/static/') && response.url().endsWith('.js')) {
      scriptBodies.push(response.text());
    }
  });

  const documentResponse = await page.goto('/42/click-error');
  await page.waitForLoadState('networkidle');

  expect(await documentResponse?.headerValue('server-timing')).toContain('sentry-release;desc="foobar123"');
  expect(scriptBodies.length).toBeGreaterThan(0);
  expect((await Promise.all(scriptBodies)).filter(body => body.includes('foobar123'))).toEqual([]);
});
