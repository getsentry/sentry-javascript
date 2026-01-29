import { expect } from '@playwright/test';
import type { Event, Profile, ProfileChunkEnvelope } from '@sentry/core';
import { sentryTest } from '../../../utils/fixtures';
import {
  getMultipleSentryEnvelopeRequests,
  properEnvelopeRequestParser,
  properFullEnvelopeRequestParser,
  shouldSkipTracingTest,
  waitForTransactionRequestOnUrl,
} from '../../../utils/helpers';
import { validateProfile, validateProfilePayloadMetadata } from '../test-utils';

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

sentryTest(
  'sends profile envelope in trace mode (single chunk for overlapping spans)',
  async ({ page, getLocalTestUrl, browserName }) => {
    if (shouldSkipTracingTest() || browserName !== 'chromium') {
      // Profiling only works when tracing is enabled
      sentryTest.skip();
    }

    const url = await getLocalTestUrl({ testDir: __dirname, responseHeaders: { 'Document-Policy': 'js-profiling' } });
    await page.goto(url);

    const profileChunkEnvelopePromise = getMultipleSentryEnvelopeRequests<ProfileChunkEnvelope>(
      page,
      1,
      { envelopeType: 'profile_chunk' },
      properFullEnvelopeRequestParser,
    );

    const profileChunkEnvelopeItem = (await profileChunkEnvelopePromise)[0][1][0];
    const envelopeItemHeader = profileChunkEnvelopeItem[0];
    const envelopeItemPayload = profileChunkEnvelopeItem[1];

    expect(envelopeItemHeader).toEqual({ type: 'profile_chunk', platform: 'javascript' });
    expect(envelopeItemPayload.profile).toBeDefined();

    validateProfilePayloadMetadata(envelopeItemPayload);

    validateProfile(envelopeItemPayload.profile, {
      expectedFunctionNames: [
        '_startRootSpan',
        'withScope',
        'createChildOrRootSpan',
        'startSpanManual',
        'startJSSelfProfile',
        // both functions are captured
        'fibonacci',
        'largeSum',
      ],
      // Test that profile duration makes sense (should be > 20ms based on test setup
      minSampleDurationMs: 20,
      isChunkFormat: true,
    });
  },
);

sentryTest('attaches thread data to child spans (trace mode)', async ({ page, getLocalTestUrl, browserName }) => {
  if (shouldSkipTracingTest() || browserName !== 'chromium') {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname, responseHeaders: { 'Document-Policy': 'js-profiling' } });
  const req = await waitForTransactionRequestOnUrl(page, url);
  const rootSpan = properEnvelopeRequestParser<Event>(req, 0) as any;

  expect(rootSpan?.type).toBe('transaction');
  expect(rootSpan.transaction).toBe('root-fibonacci-2');

  const profilerId = rootSpan?.contexts?.profile?.profiler_id as string | undefined;
  expect(typeof profilerId).toBe('string');

  expect(profilerId).toMatch(/^[a-f\d]{32}$/);

  const spans = (rootSpan?.spans ?? []) as Array<{ data?: Record<string, unknown> }>;
  expect(spans.length).toBeGreaterThan(0);
  for (const span of spans) {
    expect(span.data).toBeDefined();
    expect(span.data?.['thread.id']).toBe('0');
    expect(span.data?.['thread.name']).toBe('main');
  }
});
