import type { Client } from '../../client';

/**
 * Determines if span streaming is enabled for the given client
 */
export function hasSpanStreamingEnabled(client: Client): boolean {
  return client.getOptions().traceLifecycle === 'stream';
}
