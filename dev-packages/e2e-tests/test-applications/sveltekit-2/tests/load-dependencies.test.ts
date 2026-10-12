import { expect, test } from '@playwright/test';
import { getSpanOp, waitForStreamedSpan } from '@sentry-internal/test-utils';
import { waitForInitialPageload } from './utils';

test("doesn't rerun a wrapped layout server load that doesn't depend on the url", async ({ page }) => {
  await waitForInitialPageload(page, { route: '/load-dependencies/a' });

  const layoutLoadCount = page.locator('#layout-load-count');
  const initialText = await layoutLoadCount.textContent();

  const navigationSpanPromise = waitForStreamedSpan('sveltekit-2', span => {
    return span.name === '/load-dependencies/b' && getSpanOp(span) === 'navigation' && span.is_segment;
  });

  await page.getByText('Go to B').click();
  await expect(page.getByText('Page B')).toBeVisible();
  await navigationSpanPromise;

  await expect(layoutLoadCount).toHaveText(initialText!);
});
