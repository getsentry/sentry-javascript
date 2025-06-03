import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, shouldSkipTracingTest, waitForTransactionRequest } from '../../../../utils/helpers';

sentryTest(
  'should ignore mark and measure spans that match `ignorePerformanceApiSpans`',
  async ({ getLocalTestUrl, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });

    const transactionRequestPromise = waitForTransactionRequest(
      page,
      evt => evt.type === 'transaction' && evt.contexts?.trace?.op === 'pageload',
    );

    await page.goto(url);

    const transactionEvent = envelopeRequestParser(await transactionRequestPromise);
    const markAndMeasureSpans = transactionEvent.spans?.filter(({ op }) => op && ['mark', 'measure'].includes(op));

    expect(markAndMeasureSpans?.length).toBe(3);
    expect(markAndMeasureSpans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'mark-pass',
          op: 'mark',
        }),
        expect.objectContaining({
          description: 'measure-pass',
          op: 'measure',
        }),
        expect.objectContaining({
          description: 'sentry-tracing-init',
          op: 'mark',
        }),
      ]),
    );
  },
);
