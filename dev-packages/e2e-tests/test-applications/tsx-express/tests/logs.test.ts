import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem } from '@sentry-internal/test-utils';
import type { SerializedLogContainer } from '@sentry/core';

test('Sends logs', async ({ baseURL }) => {
  const logEnvelopePromise = waitForEnvelopeItem('tsx-express', envelope => {
    return envelope[0].type === 'log' && (envelope[1] as SerializedLogContainer).items[0]?.level === 'debug';
  });

  await fetch(`${baseURL}/test-log`);

  const logEnvelope = await logEnvelopePromise;
  const log = (logEnvelope[1] as SerializedLogContainer).items[0];
  expect(log?.level).toBe('debug');
  expect(log?.body).toBe('Accessed /test-log route');
});
