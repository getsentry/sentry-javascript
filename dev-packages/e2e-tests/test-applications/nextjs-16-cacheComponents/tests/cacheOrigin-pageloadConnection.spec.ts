import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

const APP = 'nextjs-16-cacheComponents';

// The server only writes `sentry-trace` meta tags for a render that happened for the current request,
// never while it prerenders a shell. So a tag in the document can always be continued; the only
// question is when it arrives. The resumed part of a prerendered shell arrives after the SDK started,
// which the pageload instrumentation waits for. A shell prerendered at runtime carries a `sentry-shell`
// marker instead, which marks the pageload as served from a cached shell and links the prerender.

test('connects the pageload trace to the runtime server request', async ({ page }) => {
  // The shell is prerendered, but the page's dynamic part (`DynamicContent` awaits `headers()`)
  // runs on the server on every request and produces the `GET /pageload-tracing` transaction.
  const serverTxPromise = waitForTransaction(APP, transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /pageload-tracing'
    );
  });

  const pageloadTxPromise = waitForTransaction(APP, transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/pageload-tracing';
  });

  await page.goto('/pageload-tracing');

  await expect(page.locator('#todos-fetched')).toHaveText('Todos fetched: 5');

  const [serverTx, pageloadTx] = await Promise.all([serverTxPromise, pageloadTxPromise]);

  expect(serverTx.contexts?.trace?.trace_id).toBeTruthy();
  expect(pageloadTx.contexts?.trace?.trace_id).toBe(serverTx.contexts?.trace?.trace_id);
});

test('connects the pageload trace to a blocking render', async ({ page }) => {
  const serverTxPromise = waitForTransaction(APP, transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /blocking';
  });

  const pageloadTxPromise = waitForTransaction(APP, transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/blocking';
  });

  await page.goto('/blocking');

  await expect(page.locator('#blocking')).toHaveText('Blocking render for a browser');

  const [serverTx, pageloadTx] = await Promise.all([serverTxPromise, pageloadTxPromise]);

  // The whole page renders per request, so the tag in <head> is this request's and is continued.
  expect(serverTx.contexts?.trace?.trace_id).toBeTruthy();
  expect(pageloadTx.contexts?.trace?.trace_id).toBe(serverTx.contexts?.trace?.trace_id);
  expect(pageloadTx.contexts?.trace?.links).toBeUndefined();
});

test('does not share a trace between visitors of a shell generated at request time', async ({ browser }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'Shells are only cached in production builds');

  // `[id]` only lists `test` in `generateStaticParams`, so the first visit prerenders and caches the
  // shell for this id. The prerender writes no trace tag, only a `sentry-shell` marker with its own
  // trace, so every visitor starts a fresh trace that links the prerender and is marked as a cached shell.
  const id = `shell-${Date.now()}`;

  const visit = async (): Promise<{ traceId: string | undefined; links: unknown; cachedShell: unknown }> => {
    const context = await browser.newContext();
    const page: Page = await context.newPage();

    const pageloadTxPromise = waitForTransaction(APP, transactionEvent => {
      return (
        transactionEvent.contexts?.trace?.op === 'pageload' &&
        transactionEvent.contexts?.trace?.data?.['url.path'] === `/${id}`
      );
    });

    await page.goto(`/${id}`);
    await expect(page.locator('#result')).toHaveText(`Hello, ${id}!`);
    expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
    expect(await page.locator('meta[name="sentry-shell"]').count()).toBe(1);

    const pageloadTx = await pageloadTxPromise;
    await context.close();

    return {
      traceId: pageloadTx.contexts?.trace?.trace_id,
      links: pageloadTx.contexts?.trace?.links,
      cachedShell: pageloadTx.contexts?.trace?.data?.['sentry.nextjs.cached_shell'],
    };
  };

  const first = await visit();
  const second = await visit();

  expect(first.traceId).toBeTruthy();
  expect(second.traceId).toBeTruthy();
  expect(second.traceId).not.toBe(first.traceId);
  expect(first.cachedShell).toBe(true);
  expect(second.cachedShell).toBe(true);

  // Both link the one request that prerendered the shell, which is neither visitor's own trace.
  const linkOf = (links: unknown): { trace_id: string; attributes?: Record<string, unknown> } => {
    const link = (links as Array<{ trace_id: string; attributes?: Record<string, unknown> }>)[0];
    expect(link?.attributes?.['sentry.link.type']).toBe('cache_origin');
    return link!;
  };
  expect(linkOf(first.links).trace_id).toBe(linkOf(second.links).trace_id);
  expect(linkOf(second.links).trace_id).not.toBe(second.traceId);
});

test('starts a fresh trace on a fully static page', async ({ page }) => {
  test.skip(process.env.TEST_ENV !== 'production', 'Pages are only prerendered in production builds');

  const pageloadTxPromise = waitForTransaction(APP, transactionEvent => {
    return transactionEvent.contexts?.trace?.op === 'pageload' && transactionEvent.transaction === '/static-shell';
  });

  await page.goto('/static-shell');

  await expect(page.locator('#static-shell')).toHaveText('Static shell');

  const pageloadTx = await pageloadTxPromise;

  // A build-time shell carries no trace context and no marker, the SDK does not run during the build.
  expect(await page.locator('meta[name="sentry-trace"]').count()).toBe(0);
  expect(await page.locator('meta[name="sentry-shell"]').count()).toBe(0);
  expect(pageloadTx.contexts?.trace?.trace_id).toBeTruthy();
  expect(pageloadTx.contexts?.trace?.links).toBeUndefined();
  expect(pageloadTx.contexts?.trace?.data?.['sentry.nextjs.cached_shell']).toBeUndefined();
});
