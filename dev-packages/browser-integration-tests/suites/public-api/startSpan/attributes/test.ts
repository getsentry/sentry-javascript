import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('sends an empty string attribute', async ({ getLocalTestUrl, page }) => {
  sentryTest.skip(shouldSkipTracingTest());
  const url = await getLocalTestUrl({ testDir: __dirname });
  const spanPromise = waitForStreamedSpan(page, span => span.name === 'child_span');
  await page.goto(url);

  const span = await spanPromise;
  expect(span.attributes.someAttribute).toEqual({ type: 'string', value: '' });
});
