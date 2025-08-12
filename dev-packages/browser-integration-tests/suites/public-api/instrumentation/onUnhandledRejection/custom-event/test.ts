import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../../utils/helpers';

// something, somewhere, (likely a browser extension) effectively casts PromiseRejectionEvents
// to CustomEvents, moving the `promise` and `reason` attributes of the PRE into
// the CustomEvent's `detail` attribute, since they're not part of CustomEvent's spec
// see https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent and
// https://github.com/getsentry/sentry-javascript/issues/2380
sentryTest(
  'should capture PromiseRejectionEvent cast to CustomEvent with type unhandledrejection',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });

    const eventData = await getFirstSentryEnvelopeRequest<Event>(page, url);

    expect(eventData.exception?.values).toHaveLength(1);
    expect(eventData.exception?.values?.[0]).toMatchObject({
      type: 'Error',
      value: 'promiseError',
      mechanism: {
        type: 'auto.browser.global_handlers.onunhandledrejection',
        handled: false,
      },
      stacktrace: {
        frames: expect.any(Array),
      },
    });
  },
);
