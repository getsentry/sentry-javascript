import { expect } from '@playwright/test';
import type { Event } from '@sentry/browser';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest(
  'should correctly capture multiple consecutive breadcrumbs if they are of different type',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    await page.goto(url);

    const promise = getFirstSentryEnvelopeRequest<Event>(page);

    // These inputs will be debounced
    await page.locator('#input1').pressSequentially('abc', { delay: 1 });
    await page.locator('#input1').pressSequentially('def', { delay: 1 });
    await page.locator('#input1').pressSequentially('ghi', { delay: 1 });

    await page.locator('#input1').click();
    await page.locator('#input1').click();
    await page.locator('#input1').click();

    // This input should not be debounced
    await page.locator('#input1').pressSequentially('jkl', { delay: 1 });

    await page.evaluate('Sentry.captureException("test exception")');

    const eventData = await promise;

    expect(eventData.breadcrumbs).toEqual([
      {
        category: 'ui.input',
        message: 'body > input#input1[type="text"]',
        timestamp: expect.any(Number),
      },
      {
        category: 'ui.click',
        message: 'body > input#input1[type="text"]',
        timestamp: expect.any(Number),
      },
      {
        category: 'ui.input',
        message: 'body > input#input1[type="text"]',
        timestamp: expect.any(Number),
      },
    ]);
  },
);
