import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('[bug] accepts non-primitive tags', async ({ getLocalTestUrl, page }) => {
  // this is a bug that went unnoticed due to type definitions and a bad assertion
  // TODO: We should not accept non-primitive tags. Fix this as a follow-up.
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.message).toBe('non_primitives');

  // TODO: This should be an empty object but instead, it is:
  expect(eventData.tags).toEqual({
    tag_1: {},
    tag_2: [],
    tag_3: ['a', {}],
  });
});
