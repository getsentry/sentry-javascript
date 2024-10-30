import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('sends pinia action breadcrumbs and state context', async ({ page }) => {
  await page.goto('/pinia-cart');

  await page.locator('#item-input').fill('item');
  await page.locator('#item-add').click();

  const errorPromise = waitForError('nuxt-4', async errorEvent => {
    return errorEvent?.exception?.values?.[0].value === 'This is an error';
  });

  await page.locator('#throw-error').click();

  const error = await errorPromise;

  expect(error).toBeTruthy();
  expect(error.breadcrumbs?.length).toBeGreaterThan(0);

  const actionBreadcrumb = error.breadcrumbs?.find(breadcrumb => breadcrumb.category === 'action');

  expect(actionBreadcrumb).toBeDefined();
  expect(actionBreadcrumb?.message).toBe('Transformed: addItem');
  expect(actionBreadcrumb?.level).toBe('info');

  const stateContext = error.contexts?.state?.state;

  expect(stateContext).toBeDefined();
  expect(stateContext?.type).toBe('pinia');
  expect(stateContext?.value).toEqual({
    transformed: true,
    rawItems: ['item'],
  });
});
