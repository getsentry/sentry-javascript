import { expect, test } from '@playwright/test';
import fs from 'fs';

test('should not print warning for async params', async ({ page }) => {
  test.skip(
    process.env.TEST_ENV !== 'development' && process.env.TEST_ENV !== 'dev-turbopack',
    'should be skipped for non-dev mode',
  );
  await page.goto('/');

  // If the server exits with code 1, the test will fail (see instrumentation.ts)
  const devStdout = fs.readFileSync('.tmp_dev_server_logs', 'utf-8');
  expect(devStdout).not.toContain('`params` should be awaited before using its properties.');

  await expect(page.getByText('Next 15 test app')).toBeVisible();
});
