import { expect, test } from '@playwright/test';
import { countEnvelopes } from './utils/helpers';

test('should not report thrown redirect response on client side.', async ({ page }) => {
  const count = await countEnvelopes(page, { url: '/throw-redirect', envelopeType: 'event' });

  expect(count).toBe(0);
});
