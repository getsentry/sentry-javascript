import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest('captures Breadcrumb for events on inputs & debounced them', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.route('**/foo', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        userNames: ['John', 'Jane'],
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  const promise = getFirstSentryEnvelopeRequest<Event>(page);

  await page.goto(url);

  void page.click('#input1');
  // Not debounced because other event type
  await page.type('#input1', 'John');
  // This should be debounced
  await page.type('#input1', 'Abby');
  // not debounced because other target
  await page.type('#input2', 'Anne');

  // Wait a second for the debounce to finish
  await page.waitForTimeout(1000);
  await page.type('#input2', 'John');

  await page.evaluate('Sentry.captureException("test exception")');

  const eventData = await promise;

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData.breadcrumbs).toEqual([
    {
      timestamp: expect.any(Number),
      category: 'ui.click',
      message: 'body > input#input1[type="text"]',
    },
    {
      timestamp: expect.any(Number),
      category: 'ui.input',
      message: 'body > input#input1[type="text"]',
    },
    {
      timestamp: expect.any(Number),
      category: 'ui.input',
      message: 'body > input#input2[type="text"]',
    },
    {
      timestamp: expect.any(Number),
      category: 'ui.input',
      message: 'body > input#input2[type="text"]',
    },
  ]);
});
