import { expect } from '@playwright/test';
import type { ViewHierarchyData } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests, envelopeParser, shouldSkipTracingTest } from '../../../utils/helpers';

sentryTest('Captures view hierarchy as attachment', async ({ getLocalTestUrl, page }) => {
  const bundle = process.env.PW_BUNDLE;
  if (bundle != null && !bundle.includes('esm') && !bundle.includes('cjs')) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const [, events] = await Promise.all([
    page.goto(url),
    getMultipleSentryEnvelopeRequests<ViewHierarchyData>(
      page,
      1,
      {},
      req => envelopeParser(req)?.[4] as ViewHierarchyData,
    ),
  ]);

  expect(events).toHaveLength(1);
  const event: ViewHierarchyData = events[0];

  expect(event.rendering_system).toBe('DOM');
  expect(event.positioning).toBe('absolute');
  expect(event.windows).toHaveLength(2);
  expect(event.windows[0].type).toBe('h1');
  expect(event.windows[0].visible).toBe(true);
  expect(event.windows[0].alpha).toBe(1);
  expect(event.windows[0].children).toHaveLength(0);

  expect(event.windows[1].type).toBe('p');
  expect(event.windows[1].visible).toBe(true);
  expect(event.windows[1].alpha).toBe(1);
  expect(event.windows[1].children).toHaveLength(0);
});
