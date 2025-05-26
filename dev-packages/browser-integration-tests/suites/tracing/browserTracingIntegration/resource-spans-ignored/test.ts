import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest(
  'should allow specific types of resource spans to be ignored.',
  async ({ getLocalTestUrl, page }) => {
    await page.route('**/path/to/script.js', (route: Route) =>
      route.fulfill({ path: `${__dirname}/assets/script.js` }),
    );

    const url = await getLocalTestUrl({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
    const uiSpans = eventData.spans?.filter(({ op }) => op?.startsWith('resource.script'));

    expect(uiSpans?.length).toBe(0);
  },
);
