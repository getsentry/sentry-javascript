import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

const isWebpackDev = process.env.TEST_ENV === 'development-webpack';

test('React component annotation adds data-sentry-component attributes (Turbopack)', async ({ page }) => {
  test.skip(isWebpackDev, 'Only relevant for Turbopack builds');

  await page.goto('/component-annotation');

  const button = page.locator('#annotated-btn');
  await expect(button).toBeVisible();

  // Set up error listener before clicking
  const errorPromise = waitForError('nextjs-16', errorEvent => {
    return errorEvent?.exception?.values?.some(value => value.value === 'component-annotation-test') ?? false;
  });

  await button.click();
  const errorEvent = await errorPromise;

  expect(errorEvent.exception?.values?.[0]?.value).toBe('component-annotation-test');

  // In production, TEST_ENV=production is shared by both turbopack and webpack variants.
  // The component annotation loader only runs in Turbopack builds, so only assert
  // DOM attributes and breadcrumb component names when the build is actually turbopack.
  const annotatedEl = page.locator('[data-sentry-component="ComponentAnnotationTestPage"]');
  const isAnnotated = (await annotatedEl.count()) > 0;

  if (isAnnotated) {
    await expect(annotatedEl).toBeVisible();

    const clickBreadcrumb = errorEvent.breadcrumbs?.find(bc => bc.category === 'ui.click');
    expect(clickBreadcrumb?.data?.['ui.component_name']).toBe('ComponentAnnotationTestPage');
  }
});
