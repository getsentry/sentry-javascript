import { type Client, debug, defineIntegration, type Event, type EventHint } from '@sentry/core';
import type { NodeOptions } from '@sentry/node';

/**
 * Integration that filters out noisy http transactions such as requests to node_modules, favicon.ico, @id/
 *
 */

function _lowQualityTransactionsFilterIntegration(options: NodeOptions): {
  name: string;
  processEvent: (event: Event, hint: EventHint, client: Client) => Event | null;
} {
  const matchedRegexes = [/GET \/node_modules\//, /GET \/favicon\.ico/, /GET \/@id\//, /GET \/__manifest\?/];

  return {
    name: 'LowQualityTransactionsFilter',

    processEvent(event: Event, _hint: EventHint, _client: Client): Event | null {
      if (event.type !== 'transaction' || !event.transaction) {
        return event;
      }

      const transaction = event.transaction;

      if (matchedRegexes.some(regex => transaction.match(regex))) {
        options.debug && debug.log('[ReactRouter] Filtered node_modules transaction:', event.transaction);
        return null;
      }

      return event;
    },
  };
}

export const lowQualityTransactionsFilterIntegration = defineIntegration((options: NodeOptions) =>
  _lowQualityTransactionsFilterIntegration(options),
);
