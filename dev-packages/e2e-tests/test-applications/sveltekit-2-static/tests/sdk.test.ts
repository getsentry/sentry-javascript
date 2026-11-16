import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { PAGE_SERVER_RENDERING_TYPE } from '@sentry/conventions/attributes';
import { PAGELOAD } from '@sentry/conventions/op';
import { waitForInitialPageload } from './utils';

function sentryMetaTagNames(html: string): string[] {
  return [...html.matchAll(/<meta name="(sentry-[\w-]+|baggage)"/g)].map(match => match[1] ?? '');
}

test.describe('SDK-internal behavior', () => {
  test("Doesn't inject fetch proxy script for SvelteKit>=2.16.0", async ({ page }) => {
    await waitForInitialPageload(page, { route: '/' });

    // @ts-expect-error this is defined
    await page.waitForFunction(() => typeof window.__SENTRY__ === 'object');

    const proxyHandle = await page.evaluate('typeof window._sentryFetchProxy');

    // fetch proxy script didn't run
    expect(proxyHandle).toBe('undefined');
  });

  [
    { path: '/prerendered', kind: 'a prerendered page', expected: ['sentry-cache-origin'] },
    { path: '/prerendered-shell', kind: 'a prerendered client-side shell', expected: [] },
    { path: '/', kind: 'a server-rendered page', expected: ['sentry-trace', 'baggage'] },
  ].forEach(({ path, kind, expected }) => {
    test(`Writes the expected Sentry meta tags into ${kind} (${path})`, async ({ request }) => {
      const html = await (await request.get(path)).text();

      expect(sentryMetaTagNames(html)).toEqual(expected);
    });
  });

  test('Marks the pageload of a prerendered page as statically rendered, without a link', async ({ page }) => {
    const pageloadTxnPromise = waitForTransaction('sveltekit-2-static', txnEvent => {
      return txnEvent?.transaction === '/prerendered' && txnEvent.contexts?.trace?.op === PAGELOAD;
    });

    await page.goto('/prerendered');
    const pageloadTxn = await pageloadTxnPromise;

    expect(pageloadTxn.contexts?.trace?.data?.[PAGE_SERVER_RENDERING_TYPE]).toBe('static');
    expect(pageloadTxn.contexts?.trace?.links).toBeUndefined();
    expect(pageloadTxn.contexts?.trace?.parent_span_id).toBeUndefined();
  });

  test("Doesn't mark the pageload of a prerendered client-side shell", async ({ page }) => {
    const pageloadTxnPromise = waitForTransaction('sveltekit-2-static', txnEvent => {
      return txnEvent?.transaction === '/prerendered-shell' && txnEvent.contexts?.trace?.op === PAGELOAD;
    });

    await page.goto('/prerendered-shell');
    const pageloadTxn = await pageloadTxnPromise;

    expect(pageloadTxn.contexts?.trace?.data?.[PAGE_SERVER_RENDERING_TYPE]).toBeUndefined();
    expect(pageloadTxn.contexts?.trace?.parent_span_id).toBeUndefined();
  });
});
