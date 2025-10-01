import { applySdkMetadata } from '@sentry/core';
import type { Event, NodeClient, NodeOptions } from '@sentry/node';
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

  const client = initNodeSdk(opts);

  client?.addEventProcessor(
    Object.assign(
      (event: Event) => {
        // For http.server spans that did not go though the astro middleware,
        // we want to drop them
        // this is the case with http.server spans of prerendered pages
        // we do not care about those, as they are effectively static
        if (
          event.type === 'transaction' &&
          event.contexts?.trace?.op === 'http.server' &&
          event.contexts?.trace?.origin === 'auto.http.otel.http'
        ) {
          return null;
        }

        return event;
      },
      { id: 'AstroHttpEventProcessor' },
    ),
  );

  return client;
}
