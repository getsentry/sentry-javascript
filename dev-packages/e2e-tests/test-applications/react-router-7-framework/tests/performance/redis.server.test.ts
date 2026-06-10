import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';
import { APP_NAME } from '../constants';

test.describe('server - redis db spans', () => {
  test('server loader emits db.redis child spans on the http.server transaction', async ({ page }) => {
    const txPromise = waitForTransaction(APP_NAME, async transactionEvent => {
      return (
        transactionEvent.transaction === 'GET /performance/redis' &&
        (transactionEvent.spans?.some(span => span.op === 'db.redis') ?? false)
      );
    });

    await page.goto('/performance/redis');

    const transaction = await txPromise;

    expect(transaction.contexts?.trace?.op).toBe('http.server');
    const redisSpans = transaction.spans!.filter(span => span.op === 'db.redis');

    // loader runs SET then GET => at least two redis command spans
    expect(redisSpans.length).toBeGreaterThanOrEqual(2);

    // every redis span is a child span tagged as the redis system
    expect(redisSpans.every(span => span.data?.['db.system'] === 'redis')).toBe(true);
    expect(redisSpans.every(span => typeof span.parent_span_id === 'string')).toBe(true);
    expect(redisSpans.some(span => span.data?.['net.peer.port'] === 6379)).toBe(true);

    // db.statement starts with the command name (e.g. "set cache:greeting ...", "get cache:greeting")
    const statements = redisSpans.map(span => String(span.data?.['db.statement'] ?? '').toLowerCase());
    expect(statements.some(statement => statement.startsWith('set'))).toBe(true);
    expect(statements.some(statement => statement.startsWith('get'))).toBe(true);
  });
});
