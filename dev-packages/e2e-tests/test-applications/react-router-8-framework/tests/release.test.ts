import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import { APP_NAME, RELEASE } from './constants';

test.describe('release', () => {
  test('is not in the content-hashed client assets', () => {
    const filesWithRelease = readdirSync(path.join(process.cwd(), 'build/client/assets'), {
      recursive: true,
      withFileTypes: true,
    })
      .filter(entry => entry.isFile())
      .map(entry => path.join(entry.parentPath, entry.name))
      .filter(file => readFileSync(file, 'utf8').includes(RELEASE));

    expect(filesWithRelease).toEqual([]);
  });

  test('reaches browser events through the page', async ({ page }) => {
    const errorPromise = waitForError(APP_NAME, errorEvent => {
      return errorEvent?.exception?.values?.[0]?.value === '¡Madre mía!';
    });

    await page.goto('/errors/client');
    await page.locator('#throw-on-click').click();

    const error = await errorPromise;

    expect(error.release).toBe(RELEASE);
  });
});
