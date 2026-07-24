import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('server - instrumentation API middleware (dev mode)', () => {
  test('resolves the middleware name from the server build captured in dev mode', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return transactionEvent.transaction === 'GET /performance/with-middleware';
    });

    await page.goto(`/performance/with-middleware`);

    const transaction = await txPromise;

    const middlewareSpan = transaction?.spans?.find(
      (span: { data?: { 'sentry.op'?: string } }) => span.data?.['sentry.op'] === 'function.react_router.middleware',
    );

    expect(middlewareSpan).toBeDefined();

    // The middleware name is only available when the server build was captured. In dev mode this
    // relies on the Vite plugin injecting the capture snippet for the SSR module (see
    // makeServerBuildCapturePlugin). Without it, the span would fall back to `middleware <routeId>`.
    expect(middlewareSpan!.data?.['react_router.middleware.name']).toBe('authMiddleware');
    expect(middlewareSpan!.description).toBe('middleware authMiddleware');
  });
});
