import { applySdkMetadata } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { init as initNodeSdk } from '@sentry/node';

/**
 *
 * @param options
 */
export function init(options: NodeOptions): NodeClient | undefined {
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
    { op: 'http.server', attributes: { 'sentry.origin': 'auto.http.otel.http' } },
  ];

  return initNodeSdk(opts);
}
