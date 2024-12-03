import type { BaseTransportOptions } from '@sentry/core';

export interface VercelEdgeTransportOptions extends BaseTransportOptions {
  /** Fetch API init parameters. */
  fetchOptions?: RequestInit;
  /** Custom headers for the transport. */
  headers?: { [key: string]: string };
}
