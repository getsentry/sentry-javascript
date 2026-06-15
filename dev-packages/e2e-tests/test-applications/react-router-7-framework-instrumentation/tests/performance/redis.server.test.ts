import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('server - redis db spans (instrumentation API)', () => {
  test('OTel db.redis spans nest under the native instrumentation-API http.server transaction', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === 'GET /performance/redis' &&
        (transactionEvent.spans?.some(span => span.op === 'db.redis') ?? false)
      );
    });

    await page.goto('/performance/redis');

    const transaction = await txPromise;

    // The server transaction must come from the native instrumentation API (not the legacy handler),
    // proving auto-instrumented OTel spans still share context with the React Router server span.
    expect(transaction.contexts?.trace?.op).toBe('http.server');
    expect(transaction.contexts?.trace?.origin).toBe('auto.http.react_router.instrumentation_api');

    // Collect every span id in the transaction (root + children) so we can verify nesting.
    const rootSpanId = transaction.contexts?.trace?.span_id;
    const spanIds = new Set([rootSpanId, ...(transaction.spans ?? []).map(span => span.span_id)]);

    const redisSpans = transaction.spans!.filter(span => span.op === 'db.redis');

    // loader runs SET then GET => at least two redis command spans
    expect(redisSpans.length).toBeGreaterThanOrEqual(2);

    // every redis span nests under the native instrumentation-API http.server transaction
    const allNested = redisSpans.every(
      span => typeof span.parent_span_id === 'string' && spanIds.has(span.parent_span_id),
    );
    expect(allNested).toBe(true);
  });
});
