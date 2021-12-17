import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryRequest } from '../../../../utils/helpers';

sentryTest('should record multiple extras of different types', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  expect(eventData.message).toBe('multiple_contexts');
  expect(eventData.contexts).toMatchObject({
    context_1: {
      foo: 'bar',
      baz: { qux: 'quux' },
    },
    context_2: { 1: 'foo', bar: false },
    context_4: '[undefined]',
    context_5: '[NaN]',
    context_6: 3.141592653589793,
  });
});
