import { expect } from '@playwright/test';
import type { Event, Profile } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import {
  properEnvelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequestOnUrl,
} from '../../../utils/helpers';
import { validateProfile } from '../test-utils';

sentryTest(
  'does not send profile envelope when document-policy is not set',
  async ({ page, getLocalTestUrl, browserName }) => {
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      // Profiling only works when tracing is enabled
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname });

    const req = await waitForTransactionRequestOnUrl(page, url);
    const transactionEvent = properEnvelopeRequestParser<Event>(req, 0);
    const profileEvent = properEnvelopeRequestParser<Profile>(req, 1);

    expect(transactionEvent).toBeDefined();
    expect(profileEvent).toBeUndefined();
  },
);

sentryTest('sends profile envelope in legacy mode', async ({ page, getLocalTestUrl, browserName }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    // Profiling only works when tracing is enabled
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname, responseHeaders: { 'Document-Policy': 'js-profiling' } });

  const req = await waitForTransactionRequestOnUrl(page, url);
  const profileEvent = properEnvelopeRequestParser<Profile>(req, 1);
  expect(profileEvent).toBeDefined();

  const profile = profileEvent.profile;
  expect(profileEvent.profile).toBeDefined();

  validateProfile(profile, {
    expectedFunctionNames: [
      '_startRootSpan',
      'withScope',
      'createChildOrRootSpan',
      'startSpanManual',
      'startProfileForSpan',
      'startJSSelfProfile',
    ],
    minSampleDurationMs: 20,
    isChunkFormat: false,
  });
});
