import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('attributes fetch spans to their originating microfrontend', async ({ page }) => {
  const transactionPromise = waitForTransaction('browser-mfe-vite', transactionEvent => {
    return !!transactionEvent?.transaction && transactionEvent.contexts?.trace?.op === 'pageload';
  });

  await page.goto('/');

  const transactionEvent = await transactionPromise;
  const httpSpans = transactionEvent.spans?.filter(span => span.op === 'http.client') || [];

  // MFE spans carry the mfe.name attribute set via withScope + spanStart hook
  const headerSpan = httpSpans.find(s => s.description?.includes('/api/header-data'));
  const mfeOneSpan = httpSpans.find(s => s.description?.includes('/api/mfe-one-data'));
  const shellSpan = httpSpans.find(s => s.description?.includes('/api/shell-config'));

  expect(headerSpan).toBeDefined();
  expect(mfeOneSpan).toBeDefined();
  expect(shellSpan).toBeDefined();

  expect(headerSpan?.data?.['mfe.name']).toBe('mfe-header');
  expect(mfeOneSpan?.data?.['mfe.name']).toBe('mfe-one');

  // Shell span has no MFE tag
  expect(shellSpan?.data?.['mfe.name']).toBeUndefined();
});
