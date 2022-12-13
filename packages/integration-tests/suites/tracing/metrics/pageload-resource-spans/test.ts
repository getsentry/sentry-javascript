import { expect, Route } from '@playwright/test';
import { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should add resource spans to pageload transaction', async ({ getLocalTestPath, page }) => {
  // Intercepting asset requests to avoid network-related flakiness and random retries (on Firefox).
  await page.route('**/path/to/image.svg', (route: Route) => route.fulfill({ path: `${__dirname}/assets/image.svg` }));
  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));
  await page.route('**/path/to/style.css', (route: Route) => route.fulfill({ path: `${__dirname}/assets/style.css` }));

  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const resourceSpans = eventData.spans?.filter(({ op }) => op?.startsWith('resource'));

  expect(resourceSpans?.length).toBe(3);

  ['resource.img', 'resource.script', 'resource.link'].forEach(op =>
    expect(resourceSpans).toContainEqual(
      expect.objectContaining({
        op: op,
        parent_span_id: eventData.contexts?.trace?.span_id,
      }),
    ),
  );
});
