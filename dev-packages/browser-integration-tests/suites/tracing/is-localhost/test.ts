import fs from 'fs';
import path from 'path';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../utils/helpers';
import { waitForStreamedSpans } from '../../../utils/spanUtils';

sentryTest('is false when the page is not served from localhost', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  const url = await getLocalTestUrl({ testDir: __dirname });

  const spansPromise = waitForStreamedSpans(page, spans => spans.some(span => span.name === 'child-span'));

  await page.goto(url);

  const spans = await spansPromise;

  expect(spans.length).toBeGreaterThan(1);
  for (const span of spans) {
    expect(span.attributes['sentry.is_localhost']).toEqual({ type: 'boolean', value: false });
  }
});

sentryTest('is true when the page is served from localhost', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());

  // `getLocalTestUrl` serves from `http://sentry-test.io`, so the routes are wired up by hand here
  // to serve the very same page from `localhost` instead.
  const tmpDir = await getLocalTestUrl({ testDir: __dirname, skipRouteHandler: true });

  await page.route(/^https:\/\/dsn\.ingest\.sentry\.io\//, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-id' }) }),
  );

  await page.route('http://localhost/*.*', route => {
    const file = route.request().url().split('/').pop();
    const filePath = path.resolve(tmpDir, `./${file}`);

    return fs.existsSync(filePath) ? route.fulfill({ path: filePath }) : route.continue();
  });

  const spansPromise = waitForStreamedSpans(page, spans => spans.some(span => span.name === 'child-span'));

  await page.goto('http://localhost/index.html');

  const spans = await spansPromise;

  expect(spans.length).toBeGreaterThan(1);
  for (const span of spans) {
    expect(span.attributes['sentry.is_localhost']).toEqual({ type: 'boolean', value: true });
  }
});
