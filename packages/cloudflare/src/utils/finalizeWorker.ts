import { flush, getClient } from '@sentry/core';
import type { CloudflareClient } from '../client';

/**
 * Finalizes the worker by waiting for all user waitUntil calls to complete,
 * then flushes pending data to Sentry.
 */
export const finalizeWorker = async (): Promise<void> => {
  const cloudflareClient = getClient<CloudflareClient>();

  if (cloudflareClient) {
    await cloudflareClient.waitUntilDone();
  }

  await flush(2000);
};
