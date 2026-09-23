import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, getSpansFromEnvelope, waitForStreamedSpanEnvelope } from '../../../../utils/spanUtils';

const assetsDir = `${__dirname}/../pageload-resource-spans/assets`;

sentryTest('names streamed resource spans after the resource domain', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  // Intercepting asset requests to avoid network-related flakiness and random retries (on Firefox).
  await page.route('https://sentry-test-site.example/path/to/image.svg', (route: Route) =>
    route.fulfill({
      path: `${assetsDir}/image.svg`,
      headers: {
        'Timing-Allow-Origin': '*',
        'Content-Type': 'image/svg+xml',
      },
    }),
  );
  await page.route('https://sentry-test-site.example/path/to/script.js', (route: Route) =>
    route.fulfill({
      path: `${assetsDir}/script.js`,
      headers: {
        'Timing-Allow-Origin': '*',
        'Content-Type': 'application/javascript',
      },
    }),
  );
  await page.route('https://sentry-test-site.example/path/to/style.css', (route: Route) =>
    route.fulfill({
      path: `${assetsDir}/style.css`,
      headers: {
        'Timing-Allow-Origin': '*',
        'Content-Type': 'text/css',
      },
    }),
  );

  const spanEnvelopePromise = waitForStreamedSpanEnvelope(
    page,
    env => !!getSpansFromEnvelope(env).find(s => getSpanOp(s) === 'resource.img'),
  );

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const spans = getSpansFromEnvelope(await spanEnvelopePromise);

  const imgSpan = spans.find(s => getSpanOp(s) === 'resource.img');
  const linkSpan = spans.find(s => getSpanOp(s) === 'resource.link');

  expect(imgSpan?.name).toBe('sentry-test-site.example');
  expect(imgSpan?.attributes['url.domain']).toEqual({ type: 'string', value: 'sentry-test-site.example' });
  expect(imgSpan?.attributes['url.full']).toEqual({
    type: 'string',
    value: 'https://sentry-test-site.example/path/to/image.svg',
  });

  expect(linkSpan?.name).toBe('sentry-test-site.example');

  // Same-origin resources used to be named by their origin-relative path, they now carry the test host.
  const sameOriginScriptSpan = spans.find(
    s => getSpanOp(s) === 'resource.script' && s.name !== 'sentry-test-site.example',
  );
  expect(sameOriginScriptSpan?.name).toBe('sentry-test.io');
});
