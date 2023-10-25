import { test, expect } from '@playwright/test';
import { waitForError } from '../event-proxy-server';

test('Will capture error for SSR rendering error (Class Component)', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Pages SSR Error Class';
  });

  await page.goto('/pages-router/ssr-error-class');

  const errorEvent = await errorEventPromise;
  expect(errorEvent).toBeDefined();
});

test('Will capture error for SSR rendering error (Functional Component)', async ({ page }) => {
  const errorEventPromise = waitForError('nextjs-13-app-dir', errorEvent => {
    return errorEvent?.exception?.values?.[0]?.value === 'Pages SSR Error FC';
  });

  await page.goto('/pages-router/ssr-error-fc');

  const errorEvent = await errorEventPromise;
  expect(errorEvent).toBeDefined();
});
