import type { Route } from '@playwright/test';
import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should capture long task.', async ({ browserName, getLocalTestPath, page }) => {
  // Long tasks only work on chrome
  if (browserName !== 'chromium') {
    sentryTest.skip();
  }

  await page.route('**/path/to/script.js', (route: Route) => route.fulfill({ path: `${__dirname}/assets/script.js` }));

  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const uiSpans = eventData.spans?.filter(({ op }) => op?.startsWith('ui'));

  expect(uiSpans?.length).toBe(1);

  const [firstUISpan] = uiSpans || [];
  expect(firstUISpan).toEqual(
    expect.objectContaining({
      op: 'ui.long-task',
      description: 'Main UI thread blocked',
      parent_span_id: eventData.contexts?.trace?.span_id,
    }),
  );
  const start = (firstUISpan as Event)['start_timestamp'] ?? 0;
  const end = (firstUISpan as Event)['timestamp'] ?? 0;
  const duration = end - start;

  expect(duration).toBeGreaterThanOrEqual(0.1);
  expect(duration).toBeLessThanOrEqual(0.15);
});
