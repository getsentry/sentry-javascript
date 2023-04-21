import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest(
  'should finish pageload transaction when the page goes background',
  async ({ browserName, getLocalTestPath, page, isTracingCapableBundle }) => {
    // TODO: This is flakey on firefox... trace.status is sometimes undefined
    if (!isTracingCapableBundle() || ['firefox'].includes(browserName)) {
      sentryTest.skip();
    }
    const url = await getLocalTestPath({ testDir: __dirname });

    await page.goto(url);
    await page.click('#go-background');

    const pageloadTransaction = await getFirstSentryEnvelopeRequest<Event>(page);

    expect(pageloadTransaction.contexts?.trace?.op).toBe('pageload');
    expect(pageloadTransaction.contexts?.trace?.status).toBe('cancelled');
    expect(pageloadTransaction.contexts?.trace?.tags).toMatchObject({
      visibilitychange: 'document.hidden',
    });
  },
);
