import type { BaseTransportOptions } from '@sentry/types';

export interface VercelEdgeTransportOptions extends BaseTransportOptions {
  /** Fetch API init parameters. */
  fetchOptions?: RequestInit;
  /** Custom headers for the transport. */
  headers?: { [key: string]: string };
}
