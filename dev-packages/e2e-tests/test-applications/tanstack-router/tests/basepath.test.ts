import { expect, test } from '@playwright/test';
import { getSpanOp, waitForError, waitForStreamedSpan } from '@sentry-internal/test-utils';

// Only meaningful in the `tanstack-router (basepath)` variant, where the router is created with
// `basepath: '/app'`. The rest of the suite runs in both variants.
const BASE = process.env.E2E_TEST_BASEPATH || '';

test.describe('router basepath', () => {
  test.skip(!BASE, 'Only runs in the basepath variant');

  // `window.location.pathname` carries the basepath, but the router never sees it. Matching the
  // pageload against the raw browser path let the catch-all `/$a/$b/$c` route absorb `app` as a
  // param instead of matching `/posts/$postId`.
  test('does not leak the basepath into the matched route params', async ({ page }) => {
    const pageloadSpanPromise = waitForStreamedSpan('tanstack-router', span => {
      return span.is_segment && getSpanOp(span) === 'pageload';
    });

    await page.goto(`${BASE}/posts/456`);

    const pageloadSpan = await pageloadSpanPromise;

    // `onResolved` later merges the correct params in, but never clears the ones the bad initial
    // match already set, so the stale `a`/`b`/`c` params survive on the span. Keys are passed as
    // arrays because `toHaveProperty` would otherwise read the dots as a nested lookup.
    expect(pageloadSpan.attributes).not.toHaveProperty(['url.path.parameter.a']);
    expect(pageloadSpan.attributes).not.toHaveProperty(['url.path.parameter.b']);
    expect(pageloadSpan.attributes).not.toHaveProperty(['url.path.parameter.c']);
    expect(pageloadSpan.attributes['url.path.parameter.postId']).toEqual({ type: 'string', value: '456' });
    expect(pageloadSpan.attributes['url.template']).toEqual({ type: 'string', value: '/posts/$postId' });
  });

  // The first test only checks the span. The scope transaction is a separate value: it is set once
  // when the pageload span starts, and the later `updateName` in `onResolved` does not rewrite it.
  // So even when the sent span name is correct, errors captured after the pageload still
  // carry the name from the initial match. This test checks that scope transaction.
  test('attributes errors to the matched route for the whole page lifetime', async ({ page }) => {
    const pageloadSpanPromise = waitForStreamedSpan('tanstack-router', span => {
      return span.is_segment && getSpanOp(span) === 'pageload';
    });
    const errorPromise = waitForError('tanstack-router', async errorEvent => {
      return errorEvent.exception?.values?.[0]?.value === 'Error thrown after pageload';
    });

    await page.goto(`${BASE}/posts/456`);
    await pageloadSpanPromise;

    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('Error thrown after pageload');
      }, 0);
    });

    const errorEvent = await errorPromise;

    expect(errorEvent.transaction).toBe('/posts/$postId');
  });
});
