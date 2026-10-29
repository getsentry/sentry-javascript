import type { Client } from '@sentry/core';

// A repeated `init()` replaces the client, so a single listener flushes the latest one instead of adding one per init.
let sigtermClient: Client | undefined;

async function flushOnSigterm(): Promise<void> {
  // We have 500ms for processing here, so we try to make sure to have enough time to send the events
  await sigtermClient?.flush(200);
}

/**
 * Ensure we flush events when vercel functions are ended.
 * See: https://vercel.com/docs/functions/functions-api-reference#sigterm-signal
 */
export function setupVercelSigtermFlush(client: Client): void {
  sigtermClient = client;
  if (!process.listeners('SIGTERM').includes(flushOnSigterm)) {
    process.on('SIGTERM', flushOnSigterm);
  }
}
