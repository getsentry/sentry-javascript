import type { Request } from '@playwright/test';
import { expect } from '@playwright/test';

import { sentryTest } from '../../../../../utils/fixtures';

sentryTest(
  'should attach `sentry-trace` and `baggage` header to request matching tracePropagationTargets',
  async ({ getLocalTestPath, page }) => {
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
