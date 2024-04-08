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

  // Not debounced because other event type
  await page.locator('#input1').pressSequentially('John', { delay: 1 });

  // This should be debounced
  await page.locator('#input1').pressSequentially('Abby', { delay: 1 });

  // not debounced because other target
  await page.locator('#input2').pressSequentially('Anne', { delay: 1 });

  // Wait a second for the debounce to finish
  await page.waitForTimeout(1000);
  await page.locator('#input2').pressSequentially('John', { delay: 1 });

  await page.evaluate('Sentry.captureException("test exception")');

  const eventData = await promise;

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData.breadcrumbs).toEqual([
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

sentryTest(
  'includes the annotated component name within the breadcrumb message and data',
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

    await page.locator('#annotated-input').pressSequentially('John', { delay: 1 });
    await page.locator('#annotated-input-2').pressSequentially('John', { delay: 1 });

    await page.evaluate('Sentry.captureException("test exception")');
    const eventData = await promise;
    expect(eventData.exception?.values).toHaveLength(1);

    expect(eventData.breadcrumbs).toEqual([
      {
        timestamp: expect.any(Number),
        category: 'ui.input',
        message: 'body > AnnotatedInput',
        data: { 'ui.component_name': 'AnnotatedInput' },
      },
      {
        timestamp: expect.any(Number),
        category: 'ui.input',
        message: 'body > StyledInput',
        data: { 'ui.component_name': 'StyledInput' },
      },
    ]);
  },
);
