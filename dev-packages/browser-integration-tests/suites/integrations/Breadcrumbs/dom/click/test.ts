import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest('captures Breadcrumb for clicks & debounces them for a second', async ({ getLocalTestUrl, page }) => {
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

  await page.locator('#button1').click();

  // not debounced because other target
  await page.locator('#button2').click();
  // This should be debounced
  await page.locator('#button2').click();

  // Wait a second for the debounce to finish
  await page.waitForTimeout(1000);
  await page.locator('#button2').click();

  const [eventData] = await Promise.all([promise, page.evaluate('Sentry.captureException("test exception")')]);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData.breadcrumbs).toEqual([
    {
      timestamp: expect.any(Number),
      category: 'ui.click',
      message: 'body > button#button1[type="button"]',
    },
    {
      timestamp: expect.any(Number),
      category: 'ui.click',
      message: 'body > button#button2[type="button"]',
    },
    {
      timestamp: expect.any(Number),
      category: 'ui.click',
      message: 'body > button#button2[type="button"]',
    },
  ]);
});

sentryTest(
  'uses the annotated component name in the breadcrumb messages and adds it to the data object',
  async ({ getLocalTestUrl, page }) => {
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
    await page.locator('#annotated-button').click();
    await page.locator('#annotated-button-2').click();

    const [eventData] = await Promise.all([promise, page.evaluate('Sentry.captureException("test exception")')]);

    expect(eventData.breadcrumbs).toEqual([
      {
        timestamp: expect.any(Number),
        category: 'ui.click',
        message: 'body > AnnotatedButton',
        data: { 'ui.component_name': 'AnnotatedButton' },
      },
      {
        timestamp: expect.any(Number),
        category: 'ui.click',
        message: 'body > StyledButton',
        data: { 'ui.component_name': 'StyledButton' },
      },
    ]);
  },
);
