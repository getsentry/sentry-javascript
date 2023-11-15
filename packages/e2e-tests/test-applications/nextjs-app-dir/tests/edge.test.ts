import { test, expect } from '@playwright/test';
import { waitForError } from '../event-proxy-server';

test('Should record exceptions for faulty edge server components', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Edge Server Component Error';
  });

  await page.goto('/edge-server-components/error');

  expect(await errorEventPromise).toBeDefined();
});
