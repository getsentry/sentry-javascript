import { expect } from '@playwright/test';
import type { Event } from '@sentry/browser';

import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

sentryTest('should capture console breadcrumbs', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.breadcrumbs).toEqual([
    {
      category: 'console',
      data: { arguments: ['One'], logger: 'console' },
      level: 'log',
      message: 'One',
      timestamp: expect.any(Number),
    },
    {
      category: 'console',
      data: { arguments: ['Two', { a: 1 }], logger: 'console' },
      level: 'warning',
      message: 'Two [object Object]',
      timestamp: expect.any(Number),
    },
    {
      category: 'console',
      data: { arguments: ['Error 2', { b: '[Object]' }], logger: 'console' },
      level: 'error',
      message: 'Error 2 [object Object]',
      timestamp: expect.any(Number),
    },
    {
      category: 'console',
      data: {
        arguments: ['math broke'],
        logger: 'console',
      },
      level: 'log',
      message: 'Assertion failed: math broke',
      timestamp: expect.any(Number),
    },
  ]);
});
