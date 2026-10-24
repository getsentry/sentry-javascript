import type { BaseTransportOptions } from '@sentry/core';

export interface BrowserTransportOptions extends BaseTransportOptions {
  /** Fetch API init parameters. Used by the FetchTransport */
  fetchOptions?: RequestInit;
  /**
   * The direct ingest URL `init` sets for a managed tunnel. Envelopes go there when nothing serves the tunnel.
   *
   * @hidden
   */
  _tunnelFallbackUrl?: string;
}
