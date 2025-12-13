import { flush, getClient, type Span } from '@sentry/core';
import type { CloudflareClient } from '../client';

/**
 * Helper to end span after all waitUntil promises complete.
 * This ensures spans created in waitUntil callbacks are captured in the same transaction.
 */
export const endSpanAfterWaitUntil = async (span: Span): Promise<void> => {
  const cloudflareClient = getClient<CloudflareClient>();

  if (cloudflareClient) {
    await cloudflareClient.waitUntilDone();
  }

  span.end();
  await flush(2000);
};
