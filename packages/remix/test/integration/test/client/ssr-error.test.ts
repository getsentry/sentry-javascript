import { expect, test } from '@playwright/test';
import { countEnvelopes } from './utils/helpers';

test('should not report an SSR error on client side.', async ({ page }) => {
  const count = await countEnvelopes(page, { url: '/ssr-error', envelopeType: 'event' });

  expect(count).toBe(0);
});
