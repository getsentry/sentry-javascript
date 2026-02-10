import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../utils/helpers';

sentryTest('cultureContextIntegration captures locale, timezone, and calendar', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.exception?.values).toHaveLength(1);

  expect(eventData.contexts?.culture).toEqual({
    locale: expect.any(String),
    timezone: expect.any(String),
    calendar: expect.any(String),
  });
});
