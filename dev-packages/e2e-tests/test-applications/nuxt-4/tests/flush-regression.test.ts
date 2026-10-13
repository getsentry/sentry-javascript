import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem } from '@sentry-internal/test-utils';

// Regression test for https://github.com/getsentry/sentry-javascript/issues/23306
//
// The httpIntegration `responseHook` used to call `vercelWaitUntil(flushSafelyWithTimeout())`, which
// evaluates the flush eagerly regardless of platform. On a long-running server that meant `flush()` ran
// on every HTTP response, shipping each pending outcome as its own `client_report` envelope instead of
// aggregating it on the flush interval.
test('does not ship a client_report per HTTP response', async ({ request }) => {
  const requestCount = 5;

  // Resolve as soon as a second client_report is observed. A single one is tolerated because the 60s
  // client-report interval may happen to flush the seeded outcomes once during the window.
  let seen = 0;
  const twoReportsSeen = waitForEnvelopeItem('nuxt-4', item => item[0].type === 'client_report' && ++seen >= 2)
    .then(() => 'two-or-more' as const)
    .catch(() => 'two-or-more' as const);

  // Each request seeds one pending outcome (see server/api/flush-regression.ts).
  for (let i = 0; i < requestCount; i++) {
    await request.get('/api/flush-regression');
  }

  // Buggy build: each response flushes -> one client_report per request, so a second arrives within ms.
  // Fixed build: flushIfServerless no-ops on a long-running server, so the outcomes aggregate and at
  // most the single interval flush ships within this window.
  const result = await Promise.race([
    twoReportsSeen,
    new Promise<'at-most-one'>(resolve => setTimeout(() => resolve('at-most-one'), 5000)),
  ]);

  expect(result).toBe('at-most-one');
});
