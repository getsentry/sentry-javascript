import type { BaseTransportOptions } from '@sentry/core/browser';

export interface BrowserTransportOptions extends BaseTransportOptions {
  /** Fetch API init parameters. Used by the FetchTransport */
  fetchOptions?: RequestInit;
}
