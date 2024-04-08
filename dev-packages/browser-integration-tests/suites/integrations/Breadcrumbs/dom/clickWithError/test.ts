import { expect } from '@playwright/test';
import type { Event } from '@sentry/browser';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

// see: https://github.com/getsentry/sentry-javascript/issues/768
sentryTest(
  'should record breadcrumb if accessing the target property of an event throws an exception',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);

    const promise = getFirstSentryEnvelopeRequest<Event>(page);

    await page.locator('#input1').pressSequentially('test', { delay: 1 });

    await page.evaluate('Sentry.captureException("test exception")');

    const eventData = await promise;

    expect(eventData.breadcrumbs).toHaveLength(1);
    expect(eventData.breadcrumbs).toEqual([
      {
        category: 'ui.input',
        message: 'body > input#input1[type="text"]',
        timestamp: expect.any(Number),
      },
    ]);
  },
);
