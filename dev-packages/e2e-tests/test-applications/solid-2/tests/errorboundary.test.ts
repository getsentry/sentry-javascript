import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';

function waitForBoundaryError(count: number) {
  return waitForError('solid-2', errorEvent => {
    return (
      !errorEvent.type &&
      errorEvent.exception?.values?.[0]?.value === `Error ${count} thrown from Errored boundary in Solid 2 E2E test app`
    );
  });
}

test('captures an error caught by an Errored boundary', async ({ page }) => {
  const errorPromise = waitForBoundaryError(1);

  await page.goto('/');
  await page.locator('#caughtErrorBtn').click();

  expect(await errorPromise).toMatchObject({
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Error 1 thrown from Errored boundary in Solid 2 E2E test app',
          mechanism: {
            type: 'auto.function.solid.error_boundary',
            handled: true,
          },
        },
      ],
    },
  });
});

test('captures a second error after the boundary is reset', async ({ page }) => {
  const firstErrorPromise = waitForBoundaryError(1);

  await page.goto('/');
  await page.locator('#caughtErrorBtn').click();
  await firstErrorPromise;

  const secondErrorPromise = waitForBoundaryError(2);

  await page.locator('#errorBoundaryResetBtn').click();
  await expect(page.locator('#noError')).toBeVisible();
  await page.locator('#caughtErrorBtn').click();

  expect(await secondErrorPromise).toMatchObject({
    exception: {
      values: [
        {
          value: 'Error 2 thrown from Errored boundary in Solid 2 E2E test app',
          mechanism: { type: 'auto.function.solid.error_boundary', handled: true },
        },
      ],
    },
  });
});

// Solid only fills in component names on its observe and dev builds.
const hasComponentNames = process.env.TEST_ENV === 'development' || process.env.SOLID_OBSERVE === '1';

test('attaches Solid component paths to boundary errors', async ({ page }) => {
  test.skip(!hasComponentNames, 'Solid production builds have no component names');

  const errorPromise = waitForBoundaryError(1);

  await page.goto('/');
  await page.locator('#caughtErrorBtn').click();

  expect((await errorPromise).contexts?.solid).toEqual({
    owner_path: expect.arrayContaining(['<App>', '<Errored>']),
    boundary_path: expect.arrayContaining(['<Errored>']),
  });
});
