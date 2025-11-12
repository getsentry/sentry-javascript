import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('accepts and sends non-primitive tags', async ({ getLocalTestUrl, page }) => {
  // Technically, accepting and sending non-primitive tags is a specification violation.
  // This slipped through because a previous version of this test should have ensured that
  // we don't accept non-primitive tags. However, the test was flawed.
  // Turns out, Relay and our product handle invalid tag values gracefully.
  // Our type definitions for setTag(s) also only allow primitive values.
  // Therefore (to save some bundle size), we'll continue accepting and sending non-primitive
  // tag values for now (but not adjust types).
  // This test documents this decision, so that we know why we're accepting non-primitive tags.
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(eventData.message).toBe('non_primitives');

  expect(eventData.tags).toEqual({
    tag_1: {},
    tag_2: [],
    tag_3: ['a', {}],
  });
});
