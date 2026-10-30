import { SENTRY_ORIGIN } from '@sentry/conventions/attributes';
import { HTTP_SERVER } from '@sentry/conventions/op';
import { _INTERNAL_getActiveClient, applySdkMetadata, debug } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';
import { DEBUG_BUILD } from '../debug-build';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): NodeClient | undefined {
  // The integration imports the server config from the server entry and from SSR pages, and a `node --import`
  // preload of it is supported too. The first init wins.
  const existingClient = _INTERNAL_getActiveClient<NodeClient>();
  if (existingClient) {
    DEBUG_BUILD && debug.log('SDK already initialized');

    return existingClient;
  }

  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'astro', ['astro', 'node']);

  opts.ignoreSpans = [
    ...(opts.ignoreSpans || []),
    // For http.server spans that did not go though the astro middleware,
    // we want to drop them
    // this is the case with http.server spans of prerendered pages
    // we do not care about those, as they are effectively static
    { op: HTTP_SERVER, attributes: { [SENTRY_ORIGIN]: 'auto.http.http_server' } },
  ];

  return initNodeSdk(opts);
}
