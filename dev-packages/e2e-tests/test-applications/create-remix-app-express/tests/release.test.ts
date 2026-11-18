import { expect, test } from '@playwright/test';
import { waitForError } from '@sentry-internal/test-utils';
import * as fs from 'fs';
import * as path from 'path';

const RELEASE = 'create-remix-app-express-release';

// The release only reaches the page through the production build.
test.skip(process.env.TEST_ENV === 'development', 'Needs the production build');

function listFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => (entry.isDirectory() ? listFiles(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
}

test('Sends the release with client-side errors', async ({ page }) => {
  const errorPromise = waitForError('create-remix-app-express', errorEvent => {
    return errorEvent.exception?.values?.[0].value === 'I am an error!';
  });

  await page.goto('/');
  await page.locator('id=exception-button').click();

  const errorEvent = await errorPromise;

  expect(errorEvent.release).toBe(RELEASE);
});

// A release in the content-hashed client chunks renames them on every release.
test('Keeps the release out of the client build', () => {
  const filesWithRelease = listFiles('build/client').filter(file => fs.readFileSync(file, 'utf-8').includes(RELEASE));

  expect(filesWithRelease).toEqual([]);
});
