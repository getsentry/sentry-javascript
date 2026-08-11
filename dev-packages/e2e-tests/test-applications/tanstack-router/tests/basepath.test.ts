import { expect, test } from '@playwright/test';
import { waitForError, waitForTransaction } from '@sentry-internal/test-utils';

// Only meaningful in the `tanstack-router (basepath)` variant, where the router is created with
// `basepath: '/app'`. The rest of the suite runs in both variants.
const BASE = process.env.E2E_TEST_BASEPATH || '';

test.describe('router basepath', () => {
  test.skip(!BASE, 'Only runs in the basepath variant');

  // `window.location.pathname` carries the basepath, but the router never sees it. Matching the
  // pageload against the raw browser path let the catch-all `/$a/$b/$c` route absorb `app` as a
  // param instead of matching `/posts/$postId`.
  test('does not leak the basepath into the matched route params', async ({ page }) => {
    const transactionPromise = waitForTransaction('tanstack-router', async transactionEvent => {
      return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
    });

    await page.goto(`${BASE}/posts/456`);

    const rootSpan = await transactionPromise;

    // `onResolved` later merges the correct params in, but never clears the ones the bad initial
    // match already set, so the stale `a`/`b`/`c` params survive on the span. Keys are passed as
    // arrays because `toHaveProperty` would otherwise read the dots as a nested lookup.
    const traceData = rootSpan.contexts?.trace?.data;
    expect(traceData).not.toHaveProperty(['url.path.params.a']);
    expect(traceData).not.toHaveProperty(['url.path.params.b']);
    expect(traceData).not.toHaveProperty(['url.path.params.c']);
    expect(traceData).toHaveProperty(['url.path.params.postId'], '456');
    expect(traceData).toHaveProperty(['url.template'], '/posts/$postId');
  });

  // The scope transaction is set when the pageload span starts, and the later `updateName` in
  // `onResolved` does not rewrite it — so a wrong initial match mislabelled every error for the
  // whole page lifetime. This is the part of the bug the transaction name alone does not reveal.
  test('attributes errors to the matched route for the whole page lifetime', async ({ page }) => {
    const errorPromise = waitForError('tanstack-router', async errorEvent => {
      return errorEvent.exception?.values?.[0]?.value === 'Error thrown after pageload';
    });

    await page.goto(`${BASE}/posts/456`);

    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('Error thrown after pageload');
      }, 0);
    });

    const errorEvent = await errorPromise;

    expect(errorEvent.transaction).toBe('/posts/$postId');
  });
});
