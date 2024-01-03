import type { Request } from '@playwright/test';
import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../../utils/helpers';

sentryTest(
  '[pre-v8] should attach `sentry-trace` and `baggage` header to request matching tracingOrigins',
  async ({ getLocalTestPath, page }) => {
    if (shouldSkipTracingTest()) {
      sentryTest.skip();
    }

    const url = await getLocalTestPath({ testDir: __dirname });

    const requests = (
      await Promise.all([
        page.goto(url),
        Promise.all([0, 1, 2].map(idx => page.waitForRequest(`http://example.com/${idx}`))),
      ])
    )[1];

    expect(requests).toHaveLength(3);

    requests?.forEach(async (request: Request) => {
      const requestHeaders = await request.allHeaders();
      expect(requestHeaders).toMatchObject({
        'sentry-trace': expect.any(String),
        baggage: expect.any(String),
      });
    });
  },
);
