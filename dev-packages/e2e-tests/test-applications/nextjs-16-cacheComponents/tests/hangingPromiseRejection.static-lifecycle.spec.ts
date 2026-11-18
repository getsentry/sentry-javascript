import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

const HANGING_PROMISE_DIGEST_MESSAGE = 'rejects when the prerender is complete';

// Under Cache Components, Next.js aborts prerenders by rejecting the promises it handed out for
// uncached `fetch()` calls. React discards those rejections - they never affect the response - so the
// Sentry wrappers must not report them. See https://github.com/getsentry/sentry-javascript/issues/23592
//
// Note this only exercises the regression under the webpack variant: server components are wrapped by
// `wrappingLoader`, which Turbopack builds do not run, so there is no wrapper to observe the rejection
// there. Under Turbopack the test still asserts the route renders and reports no errors.
test('does not capture hanging prerender promise rejections on a runtime prefetch', async ({ page, request }) => {
  const capturedHangingPromiseErrors: string[] = [];
  void waitForError('nextjs-16-cacheComponents', errorEvent => {
    const value = errorEvent.exception?.values?.[0]?.value ?? '';
    if (value.includes(HANGING_PROMISE_DIGEST_MESSAGE)) {
      capturedHangingPromiseErrors.push(value);
    }
    return false;
  });

  // `Next-Router-Prefetch: 2` is what the Next.js router sends for a runtime prefetch. It makes Next.js
  // run a prerender at request time, which is what produces the hanging promise rejection. A plain
  // document request only replays the shell that was prerendered at build time and would not trigger it.
  const prefetchResponse = await request.get('/hanging-fetch', {
    headers: { RSC: '1', 'Next-Router-Prefetch': '2' },
  });
  expect(prefetchResponse.ok()).toBe(true);

  const serverTransactionPromise = waitForTransaction('nextjs-16-cacheComponents', transactionEvent => {
    return (
      transactionEvent.contexts?.trace?.op === 'http.server' && transactionEvent.transaction === 'GET /hanging-fetch'
    );
  });

  await page.goto('/hanging-fetch');
  await expect(page.locator('#fetched-value')).toHaveText('hanging-fetch-data');

  expect(await serverTransactionPromise).toBeDefined();

  // Drain marker instead of a sleep: request a route that deliberately captures an error, tagged with a
  // token unique to this run so it can never be served from cache. It is requested strictly after the
  // prefetch, and the SDK flushes per request, so once this error arrives any error the prefetch had
  // captured must already have arrived too. That makes the assertion below "nothing was captured"
  // rather than "nothing had been captured yet". It doubles as a check that errors do flow at all.
  const token = `${Date.now()}`;
  const sentinelPromise = waitForError('nextjs-16-cacheComponents', errorEvent => {
    return errorEvent.exception?.values?.[0]?.value === `error-sentinel-${token}`;
  });

  await page.goto(`/error-sentinel/${token}`);
  await expect(page.locator('#sentinel')).toHaveText(token);
  await sentinelPromise;

  expect(capturedHangingPromiseErrors).toEqual([]);
});
