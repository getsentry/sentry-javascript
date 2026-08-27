import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

const HANGING_PROMISE_DIGEST_MESSAGE = 'rejects when the prerender is complete';

function collectHangingPromiseErrors(): { events: unknown[] } {
  const collected: { events: unknown[] } = { events: [] };

  void waitForError('nextjs-16-cacheComponents', errorEvent => {
    const value = errorEvent.exception?.values?.[0]?.value ?? '';
    return value.includes(HANGING_PROMISE_DIGEST_MESSAGE);
  }).then(event => {
    collected.events.push(event);
  });

  return collected;
}

// Under Cache Components, Next.js aborts prerenders by rejecting the promises it handed out for
// uncached `fetch()` calls. React discards those rejections - they never affect the response - so the
// Sentry wrappers must not report them. See https://github.com/getsentry/sentry-javascript/issues/23592
//
// Note this only exercises the regression under the webpack variant: server components are wrapped by
// `wrappingLoader`, which Turbopack builds do not run, so there is no wrapper to observe the rejection
// there. Under Turbopack the test still asserts the route renders and reports no errors.
test('does not capture hanging prerender promise rejections on a runtime prefetch', async ({ page, request }) => {
  const collected = collectHangingPromiseErrors();

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

  // Waiting for the transaction proves the SDK was wired up and flushing events for this route, so an
  // empty error list below means "nothing was captured" rather than "nothing was listening".
  const serverTransaction = await serverTransactionPromise;
  expect(serverTransaction).toBeDefined();

  await page.waitForTimeout(5000);

  expect(collected.events).toEqual([]);
});
