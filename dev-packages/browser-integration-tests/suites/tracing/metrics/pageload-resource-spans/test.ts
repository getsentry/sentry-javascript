import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, shouldSkipTracingTest } from '../../../../utils/helpers';

sentryTest('should add resource spans to pageload transaction', async ({ getLocalTestUrl, page, browser }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  // Intercepting asset requests to avoid network-related flakiness and random retries (on Firefox).
  await page.route('https://example.com/path/to/image.svg', (route: Route) =>
    route.fulfill({ path: `${__dirname}/assets/image.svg` }),
  );
  await page.route('https://example.com/path/to/script.js', (route: Route) =>
    route.fulfill({ path: `${__dirname}/assets/script.js` }),
  );
  await page.route('https://example.com/path/to/style.css', (route: Route) =>
    route.fulfill({ path: `${__dirname}/assets/style.css` }),
  );

  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const resourceSpans = eventData.spans?.filter(({ op }) => op?.startsWith('resource'));

  const scriptSpans = resourceSpans?.filter(({ op }) => op === 'resource.script');
  const linkSpans = resourceSpans?.filter(({ op }) => op === 'resource.link');
  const imgSpans = resourceSpans?.filter(({ op }) => op === 'resource.img');

  expect(imgSpans).toHaveLength(1);
  expect(linkSpans).toHaveLength(1);

  const hasCdnBundle = (process.env.PW_BUNDLE || '').startsWith('bundle');

  const expectedScripts = ['/init.bundle.js', '/subject.bundle.js', 'https://example.com/path/to/script.js'];
  if (hasCdnBundle) {
    expectedScripts.unshift('/cdn.bundle.js');
  }

  expect(scriptSpans?.map(({ description }) => description).sort()).toEqual(expectedScripts);

  const spanId = eventData.contexts?.trace?.span_id;

  expect(spanId).toBeDefined();
  expect(imgSpans?.[0].parent_span_id).toBe(spanId);
  expect(linkSpans?.[0].parent_span_id).toBe(spanId);
  expect(scriptSpans?.map(({ parent_span_id }) => parent_span_id)).toEqual(expectedScripts.map(() => spanId));
});
