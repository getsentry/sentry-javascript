import { expect } from '@playwright/test';
import { EventHint } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryRequest } from '../../../../utils/helpers';

sentryTest('should capture a message with provided hint', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const eventData = await getSentryRequest(page, url);

  expect(eventData.message).toBe('message_with_hint');
  expect(eventData.level).toBe('error');
  expect((eventData as Event & { hint: EventHint }).hint.captureContext).toMatchObject({
    foo: 'bar',
    level: 'error',
  });
});
