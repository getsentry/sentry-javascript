import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

test('sends pinia action breadcrumbs and state context', async ({ page }) => {
  await page.goto('/cart');

  await page.locator('#item-input').fill('item');
  await page.locator('#item-add').click();

  const errorPromise = waitForError('vue-3', async errorEvent => {
    return errorEvent?.exception?.values?.[0].value === 'This is an error';
  });

  await page.locator('#throw-error').click();

  const error = await errorPromise;

  expect(error).toBeTruthy();
  expect(error.breadcrumbs?.length).toBeGreaterThan(0);

  const actionBreadcrumb = error.breadcrumbs?.find(breadcrumb => breadcrumb.category === 'pinia.action');

  expect(actionBreadcrumb).toBeDefined();
  expect(actionBreadcrumb?.message).toBe('Store: cart | Action: addItem.transformed');
  expect(actionBreadcrumb?.level).toBe('info');

  const stateContext = error.contexts?.state?.state;

  expect(stateContext).toBeDefined();
  expect(stateContext?.type).toBe('pinia');
  expect(stateContext?.value).toEqual({
    transformed: true,
    cart: {
      rawItems: ['item'],
    },
    counter: {
      count: 0,
      name: 'Counter Store',
    },
  });
});

test('state transformer receives full state object and is stored in state context', async ({ page }) => {
  await page.goto('/cart');

  await page.locator('#item-input').fill('multiple store test');
  await page.locator('#item-add').click();

  await page.locator('button:text("+")').click();
  await page.locator('button:text("+")').click();
  await page.locator('button:text("+")').click();

  await page.locator('#item-input').fill('multiple store pinia');
  await page.locator('#item-add').click();

  const errorPromise = waitForError('vue-3', async errorEvent => {
    return errorEvent?.exception?.values?.[0].value === 'This is an error';
  });

  await page.locator('#throw-error').click();

  const error = await errorPromise;

  // Verify stateTransformer was called with full state and modified state
  const stateContext = error.contexts?.state?.state;

  expect(stateContext?.value).toEqual({
    transformed: true,
    cart: {
      rawItems: ['multiple store test', 'multiple store pinia'],
    },
    counter: {
      name: 'Counter Store',
      count: 3,
    },
  });
});

test('different store interaction order maintains full state tracking', async ({ page }) => {
  await page.goto('/cart');

  await page.locator('button:text("+")').click();

  await page.locator('#item-input').fill('order test item');
  await page.locator('#item-add').click();

  await page.locator('button:text("+")').click();

  const errorPromise = waitForError('vue-3', async errorEvent => {
    return errorEvent?.exception?.values?.[0].value === 'This is an error';
  });

  await page.locator('#throw-error').click();

  const error = await errorPromise;

  const stateContext = error.contexts?.state?.state;

  expect(stateContext).toBeDefined();

  const stateValue = stateContext?.value;
  expect(stateValue.cart.rawItems).toEqual(['order test item']);
  expect(stateValue.counter.count).toBe(2);
});
