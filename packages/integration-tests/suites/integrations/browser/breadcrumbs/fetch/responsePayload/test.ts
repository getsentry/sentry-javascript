import { expect } from '@playwright/test';
import type { Breadcrumb } from '@sentry/types';

import { sentryTest } from '../../../../../../utils/fixtures';

sentryTest('captures response_payload breadcrumb if configured', async ({ getLocalTestPath, page }) => {
  await page.route('**/foo', route => {
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        testApi: 'OK',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  const request = page.waitForRequest('**/foo');
  const url = await getLocalTestPath({ testDir: __dirname });

  await page.goto(url);
  await request;

  const breadcrumbs = await page.evaluate(() => {
    return (window as unknown as Window & { breadcrumbs: Breadcrumb[] }).breadcrumbs;
  });

  expect(breadcrumbs).toEqual([
    {
      category: 'fetch',
      data: {
        method: 'POST',
        response_payload: '{"testApi":"OK"}',
        status_code: 200,
        url: 'http://localhost:7654/foo',
      },
      timestamp: expect.any(Number),
      type: 'http',
    },
  ]);
});
