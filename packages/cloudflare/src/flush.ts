import type { Client } from '@sentry/core';
import { flush } from '@sentry/core';

/**
 * Flushes the client to ensure all pending events are sent.
 *
 * Note: The client is reused across requests, so we only flush without disposing.
 *
 * @param client - The CloudflareClient instance to flush
 * @param timeout - Timeout in milliseconds for the flush operation
 * @returns A promise that resolves when flush is complete
 */
export async function flushAndDispose(client: Client | undefined, timeout = 2000): Promise<void> {
  if (!client) {
    await flush(timeout);

    return;
  }

  await client.flush(timeout);
}
