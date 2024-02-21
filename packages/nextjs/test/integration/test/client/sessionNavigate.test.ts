import { expect, test } from '@playwright/test';
import { Session } from '@sentry/types';
import { countEnvelopes, getMultipleSentryEnvelopeRequests } from './utils/helpers';

test('should report navigation sessions', async ({ page }) => {
  const event = await getMultipleSentryEnvelopeRequests<Session>(page, 1, { url: '/healthy', envelopeType: 'session' });

  expect(event[0]).toMatchObject({
    init: true,
    status: 'ok',
    errors: 0,
  });

  await page.waitForTimeout(250);

  const [, events] = await Promise.all([
    page.click('a#alsoHealthy'),
    getMultipleSentryEnvelopeRequests<Session>(page, 2, { envelopeType: 'session' }),
  ]);

  expect(events[0]).toMatchObject({
    init: false,
    status: 'exited',
    errors: 0,
  });

  await page.waitForTimeout(250);

  expect(events[1]).toMatchObject({
    init: true,
    status: 'ok',
    errors: 0,
  });

  await page.waitForTimeout(250);

  const [, events_2] = await Promise.all([
    page.click('a#healthy'),
    getMultipleSentryEnvelopeRequests<Session>(page, 2, { envelopeType: 'session' }),
  ]);

  expect(events_2[0]).toMatchObject({
    init: false,
    status: 'exited',
    errors: 0,
  });

  expect(events_2[1]).toMatchObject({
    init: true,
    status: 'ok',
    errors: 0,
  });

  expect(await countEnvelopes(page, { url: '/healthy', envelopeType: 'session' })).toBe(1);
  expect(await countEnvelopes(page, { url: '/healthy#alsoHealthy', envelopeType: 'session' })).toBe(4);
});
